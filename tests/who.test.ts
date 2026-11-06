import { beforeEach, describe, expect, it } from "vitest";
import { GameError } from "@/lib/engine";
import { MemoryStore } from "@/lib/store";
import { createWhoEngine, type WhoAction, type WhoEngine } from "@/lib/who";

let clock = 1_000_000;
let engine: WhoEngine;

beforeEach(() => {
  clock = 1_000_000;
  let seed = 1;
  // deterministic "random" so option order and picks are stable
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  engine = createWhoEngine({ store: new MemoryStore(), now: () => clock, random });
});

const FACTS: Record<string, string> = {
  Sarah: "I once got chased by monkeys on vacation.",
  Daniel: "I was locked inside a zoo overnight.",
  Matthew: "I have a twin I met when I was ten.",
  Rachel: "I've eaten a cricket on purpose.",
  Ben: "I can play the bagpipes badly.",
};

async function setup(names = Object.keys(FACTS)) {
  const { code, hostKey } = await engine.createGame();
  const players = [];
  for (const n of names) players.push(await engine.join(code, n, [FACTS[n]]));
  const host = (a: WhoAction) => engine.host(code, hostKey, a);
  return { code, hostKey, players, host };
}

async function expectError(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toBeInstanceOf(GameError);
  await p.catch((e: GameError) => expect(e.status).toBe(status));
}

describe("joining", () => {
  it("needs a name and a real fact, and rejects duplicate names", async () => {
    const { code } = await engine.createGame();
    await expectError(engine.join(code, "", ["I like long walks."]), 400);
    await expectError(engine.join(code, "Sam", ["hi"]), 400);
    await expectError(engine.join(code, "Sam", ["", "  "]), 400);
    await engine.join(code, "Sam", ["I like long walks."]);
    await expectError(engine.join(code, "sam", ["I also like walks."]), 409);
  });

  it("takes up to three facts, ignoring blanks", async () => {
    const { code } = await engine.createGame();
    const facts = ["I own 14 houseplants.", "", "I was born on a boat.", "I can juggle knives.", "I hate cheese."];
    const p = await engine.join(code, "Sam", facts);
    expect((await engine.playerView(code, p.token)).me.facts).toEqual(["I own 14 houseplants.", "I was born on a boat.", "I can juggle knives."]);
    await expectError(engine.join(code, "Kim", ["I was born on a boat.", "short"]), 400);
  });

  it("lets the same phone change its facts in the lobby", async () => {
    const { code, players } = await setup(["Sarah", "Daniel"]);
    await engine.join(code, "", ["Actually: I own 14 houseplants.", "And a cactus named Gerald."], players[0].token);
    expect((await engine.playerView(code, players[0].token)).me.facts).toEqual([
      "Actually: I own 14 houseplants.",
      "And a cactus named Gerald.",
    ]);
  });
});

describe("privacy", () => {
  it("never puts facts or the answer in public views before reveal", async () => {
    const { code, host, players } = await setup();
    const lobby = JSON.stringify(await engine.displayView(code));
    for (const f of Object.values(FACTS)) expect(lobby).not.toContain(f);
    await host({ type: "start" });
    const display = await engine.displayView(code);
    expect(display.result).toBeNull();
    const json = JSON.stringify(display);
    expect(json).not.toContain("subjectId");
    // Exactly one player is told the current question is about them.
    const views = await Promise.all(players.map((p) => engine.playerView(code, p.token)));
    expect(views.filter((v) => v.me.isSubject)).toHaveLength(1);
  });
});

describe("a question", () => {
  it("shows the owner plus three others, and the owner can't vote", async () => {
    const { code, host, players, hostKey } = await setup();
    await host({ type: "start" });
    const hv = await engine.hostView(code, hostKey);
    const q = hv.question!;
    expect(q.options).toHaveLength(4);
    expect(q.options.map((o) => o.id)).toContain(hv.subjectId);
    expect(FACTS[q.options.find((o) => o.id === hv.subjectId)!.name]).toBe(q.fact);
    const owner = players.find((p) => p.playerId === hv.subjectId)!;
    await expectError(engine.vote(code, owner.token, 0, q.options[0].id), 409);
  });

  it("takes one vote per player, scores 1 per correct guess, and locks when everyone's in", async () => {
    const { code, host, players, hostKey } = await setup();
    await host({ type: "start" });
    const { subjectId, question } = await engine.hostView(code, hostKey);
    const wrong = question!.options.find((o) => o.id !== subjectId)!.id;
    const voters = players.filter((p) => p.playerId !== subjectId);
    await engine.vote(code, voters[0].token, 0, subjectId!);
    await expectError(engine.vote(code, voters[0].token, 0, wrong), 409);
    await engine.vote(code, voters[1].token, 0, subjectId!);
    await engine.vote(code, voters[2].token, 0, wrong);
    expect((await engine.displayView(code)).locked).toBe(false);
    await engine.vote(code, voters[3].token, 0, wrong);
    expect((await engine.displayView(code)).locked).toBe(true);

    await host({ type: "reveal" });
    const v = await engine.playerView(code, voters[0].token);
    expect(v.result!.subjectId).toBe(subjectId);
    expect(v.result!.voters).toBe(4);
    expect(v.result!.counts[subjectId!]).toBe(2);
    expect(v.me.correct).toBe(true);
    expect(v.me.score).toBe(1);
    expect((await engine.playerView(code, voters[2].token)).me).toMatchObject({ correct: false, score: 0 });
  });

  it("ignores votes after the buzzer", async () => {
    const { code, host, players, hostKey } = await setup();
    await host({ type: "start" });
    const { subjectId } = await engine.hostView(code, hostKey);
    clock += 25_000;
    const voter = players.find((p) => p.playerId !== subjectId)!;
    await expectError(engine.vote(code, voter.token, 0, subjectId!), 409);
  });

  it("can swap out a fact the host doesn't want shown", async () => {
    const { code, host, hostKey } = await setup();
    await host({ type: "start" });
    const before = (await engine.hostView(code, hostKey)).subjectId;
    await host({ type: "swapQuestion" });
    const after = await engine.hostView(code, hostKey);
    expect(after.subjectId).not.toBe(before);
    expect(after.players.find((p) => p.id === before)!.facts[0].skip).toBe(true);
  });
});

describe("flow", () => {
  it("uses each fact once, shows the board every 3, and ends after the planned count", async () => {
    const { code, host, hostKey } = await setup();
    await host({ type: "skipFact", playerId: (await engine.hostView(code, hostKey)).players[4].id, factIndex: 0, skip: true });
    await host({ type: "start", count: 10 }); // only 4 usable facts
    const subjects: string[] = [];
    const phases: string[] = [];
    for (;;) {
      const hv = await engine.hostView(code, hostKey);
      if (hv.phase === "final") break;
      if (hv.phase === "board") {
        phases.push("board");
        await host({ type: "next" });
        continue;
      }
      subjects.push(hv.subjectId!);
      await host({ type: "reveal" });
      await host({ type: "next" });
    }
    expect(subjects).toHaveLength(4);
    expect(new Set(subjects).size).toBe(4);
    expect(phases).toEqual(["board"]);
    expect((await engine.displayView(code)).total).toBe(4);
  });

  it("spreads questions across people before using anyone's second or third fact", async () => {
    const { code, hostKey } = await engine.createGame();
    await engine.join(code, "Ann", ["I was a child actor.", "I've met the Pope.", "I have six toes."]);
    await engine.join(code, "Bo", ["I can't swim at all."]);
    await engine.join(code, "Cy", ["I was born in an elevator."]);
    const host = (a: WhoAction) => engine.host(code, hostKey, a);
    await host({ type: "start", count: 5 });
    expect((await engine.displayView(code)).total).toBe(5);
    const subjects: string[] = [];
    const facts: string[] = [];
    for (;;) {
      const hv = await engine.hostView(code, hostKey);
      if (hv.phase === "final") break;
      if (hv.phase === "question") {
        subjects.push(hv.question!.options.find((o) => o.id === hv.subjectId)!.name);
        facts.push(hv.question!.fact);
        await host({ type: "reveal" });
      }
      await host({ type: "next" });
    }
    expect(new Set(subjects.slice(0, 3))).toEqual(new Set(["Ann", "Bo", "Cy"]));
    expect(subjects.slice(3)).toEqual(["Ann", "Ann"]);
    expect(new Set(facts).size).toBe(5);
    const ann = (await engine.hostView(code, hostKey)).players.find((p) => p.name === "Ann")!;
    expect(ann.facts.every((f) => f.used)).toBe(true);
  });

  it("can skip one of someone's facts and keep the others", async () => {
    const { code, hostKey } = await engine.createGame();
    const ann = await engine.join(code, "Ann", ["I was a child actor.", "I've met the Pope."]);
    await engine.join(code, "Bo", ["I can't swim at all."]);
    await engine.host(code, hostKey, { type: "skipFact", playerId: ann.playerId, factIndex: 1, skip: true });
    expect((await engine.displayView(code)).factCount).toBe(2);
    // Editing in the lobby keeps the host's skip on a fact that didn't change.
    await engine.join(code, "", ["I was a child actor.", "I've met the Pope.", "I hate pickles."], ann.token);
    const facts = (await engine.hostView(code, hostKey)).players.find((p) => p.name === "Ann")!.facts;
    expect(facts.map((f) => f.skip)).toEqual([false, true, false]);
  });

  it("reads players saved with the old single-fact shape", async () => {
    const store = new MemoryStore();
    const e = createWhoEngine({ store, now: () => clock });
    const { code } = await e.createGame();
    const old = { id: "p1", name: "Old", token: "t1", fact: "I joined before multi-fact.", skip: false, joinedAt: 1 };
    await store.hset(`w:${code}:players`, "p1", JSON.stringify(old));
    expect((await e.playerView(code, "t1")).me.facts).toEqual(["I joined before multi-fact."]);
  });

  it("plays one question per usable fact unless the host caps it", async () => {
    const { code, host } = await setup(); // 5 players, 1 fact each
    await host({ type: "start" });
    expect((await engine.displayView(code)).total).toBe(5);
    await host({ type: "reset" });
    await host({ type: "start", count: 3 });
    expect((await engine.displayView(code)).total).toBe(3);
  });

  it("requires two players and a fact to start", async () => {
    const { host } = await setup(["Sarah"]);
    await expectError(host({ type: "start" }), 409);
  });
});
