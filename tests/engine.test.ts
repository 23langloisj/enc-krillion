import { beforeEach, describe, expect, it } from "vitest";
import { createEngine, GameError, type Engine } from "@/lib/engine";
import { MemoryStore } from "@/lib/store";
import { CATALOG, DEFAULT_LINEUP } from "@/content/catalog";

let clock = 1_000_000;
let engine: Engine;
let store: MemoryStore;

beforeEach(() => {
  clock = 1_000_000;
  store = new MemoryStore();
  engine = createEngine({ store, catalog: CATALOG, defaultLineup: DEFAULT_LINEUP, now: () => clock, random: () => 0.5 });
});

async function setup(teamNames = ["Ark Builders", "Mustard Seeds"]) {
  const { code, hostKey } = await engine.createGame();
  const teams = [];
  for (const name of teamNames) teams.push(await engine.joinTeam(code, name));
  const host = (action: Parameters<Engine["host"]>[2]) => engine.host(code, hostKey, action);
  return { code, hostKey, teams, host };
}

async function expectError(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toBeInstanceOf(GameError);
  await p.catch((e: GameError) => expect(e.status).toBe(status));
}

describe("joining", () => {
  it("rejoins with the same token instead of creating a duplicate team", async () => {
    const { code, teams } = await setup(["Ark Builders"]);
    const again = await engine.joinTeam(code, "whatever", teams[0].token);
    expect(again.teamId).toBe(teams[0].teamId);
    expect((await engine.displayView(code)).teamCount).toBe(1);
  });

  it("rejects duplicate team names", async () => {
    const { code } = await setup(["Ark Builders"]);
    await expectError(engine.joinTeam(code, "ark builders"), 409);
  });

  it("404s on an unknown code", async () => {
    await expectError(engine.joinTeam("ZZZZ", "x"), 404);
  });
});

describe("submissions", () => {
  it("allows exactly one submission per team per category", async () => {
    const { code, teams, host } = await setup();
    await host({ type: "start" });
    await engine.submit(code, teams[0].token, 0, "Texas");
    await expectError(engine.submit(code, teams[0].token, 0, "Wyoming"), 409);
    const view = await engine.teamView(code, teams[0].token);
    expect(view.me.submitted).toBe("Texas");
  });

  it("rejects answers after the timer (plus grace) and for the wrong category", async () => {
    const { code, teams, host } = await setup();
    await host({ type: "start" });
    await expectError(engine.submit(code, teams[0].token, 1, "Genesis"), 409);
    clock += 25_000 + 2_000;
    await expectError(engine.submit(code, teams[0].token, 0, "Texas"), 409);
  });

  it("rejects submissions while paused, accepts them after resume", async () => {
    const { code, teams, host } = await setup();
    await host({ type: "start" });
    await host({ type: "pause" });
    clock += 60_000;
    await expectError(engine.submit(code, teams[0].token, 0, "Texas"), 409);
    await host({ type: "resume" });
    await engine.submit(code, teams[0].token, 0, "Texas");
  });

  it("locks once every team is in", async () => {
    const { code, teams, host } = await setup();
    await host({ type: "start" });
    await engine.submit(code, teams[0].token, 0, "Texas");
    expect((await engine.displayView(code)).locked).toBe(false);
    await engine.submit(code, teams[1].token, 0, "Wyoming");
    expect((await engine.displayView(code)).locked).toBe(true);
  });
});

describe("privacy", () => {
  it("never shows other teams' answers or the answer bank before reveal", async () => {
    const { code, teams, host, hostKey } = await setup();
    await host({ type: "start" });
    await engine.submit(code, teams[0].token, 0, "Wyoming");
    const other = JSON.stringify(await engine.teamView(code, teams[1].token));
    const display = JSON.stringify(await engine.displayView(code));
    for (const json of [other, display]) {
      expect(json).not.toContain("Wyoming");
      expect(json).not.toContain("greatfish");
    }
    expect(JSON.stringify(await engine.hostView(code, hostKey, "memory"))).toContain("Wyoming");
  });

  it("rejects host actions with the wrong key", async () => {
    const { code } = await setup();
    await expectError(engine.host(code, "nope", { type: "start" }), 403);
    await expectError(engine.hostView(code, "nope", "memory"), 403);
  });
});

describe("scoring and flow", () => {
  it("scores by tier at reveal and accumulates standings", async () => {
    const { code, teams, host } = await setup();
    await host({ type: "start" });
    await engine.submit(code, teams[0].token, 0, "Texas"); // minnow 10
    await engine.submit(code, teams[1].token, 0, "wyomin"); // typo -> greatfish 80
    await host({ type: "reveal" });
    const view = await engine.displayView(code);
    expect(view.phase).toBe("reveal");
    expect(view.reveal!.answers.map((a) => [a.teamName, a.points, a.how])).toEqual([
      ["Ark Builders", 10, "exact"],
      ["Mustard Seeds", 80, "typo"],
    ]);
    expect(view.standings.map((s) => [s.name, s.total, s.rank])).toEqual([
      ["Mustard Seeds", 80, 1],
      ["Ark Builders", 10, 2],
    ]);
  });

  it("gives zero for missing or invalid answers", async () => {
    const { code, teams, host } = await setup();
    await host({ type: "start" });
    await engine.submit(code, teams[0].token, 0, "Narnia");
    await host({ type: "reveal" });
    const answers = (await engine.displayView(code)).reveal!.answers;
    expect(answers.map((a) => [a.points, a.how])).toEqual([
      [0, "none"],
      [0, "missing"],
    ]);
  });

  it("lets the host override after reveal and remember the answer for next time", async () => {
    const { code, teams, host } = await setup();
    await host({ type: "start" });
    await host({ type: "next" }).catch(() => {}); // can't skip without revealing
    clock += 30_000;
    await host({ type: "reveal" });
    await host({ type: "next" }); // -> bible-books
    await engine.submit(code, teams[0].token, 1, "Book of Enoch");
    await host({ type: "reveal" });
    await host({ type: "override", index: 1, teamId: teams[0].teamId, tier: "leviathan", remember: true });
    const v = await engine.displayView(code);
    expect(v.reveal!.answers[0]).toMatchObject({ points: 100, how: "override" });
    expect(v.standings[0]).toMatchObject({ name: "Ark Builders", total: 100 });

    // A fresh game now accepts it automatically.
    const g2 = await engine.createGame({ lineup: ["bible-books"] });
    const t = await engine.joinTeam(g2.code, "Solo");
    await engine.host(g2.code, g2.hostKey, { type: "start" });
    await engine.submit(g2.code, t.token, 0, "book of enoch");
    await engine.host(g2.code, g2.hostKey, { type: "reveal" });
    expect((await engine.displayView(g2.code)).reveal!.answers[0]).toMatchObject({ points: 100, how: "added" });
  });

  it("walks 3 rounds of 7 with round breaks, then final", async () => {
    const { code, host } = await setup();
    await host({ type: "start" });
    const phases: string[] = [];
    for (let i = 0; i < 21; i++) {
      await host({ type: "reveal" });
      await host({ type: "next" });
      const v = await engine.displayView(code);
      phases.push(v.phase);
      if (v.phase === "roundEnd") await host({ type: "next" });
    }
    expect(phases.filter((p) => p === "roundEnd")).toHaveLength(2);
    expect(phases[6]).toBe("roundEnd");
    expect(phases[13]).toBe("roundEnd");
    expect(phases[20]).toBe("final");
    await expectError(host({ type: "next" }), 409);
  });

  it("adds manual awards to standings", async () => {
    const { code, teams, host } = await setup();
    await host({ type: "award", teamId: teams[1].teamId, points: 15, note: "Best team name" });
    expect((await engine.displayView(code)).standings[0]).toMatchObject({ name: "Mustard Seeds", total: 15 });
  });

  it("bots answer during the window and reset clears everything", async () => {
    const { code, host } = await setup([]);
    await host({ type: "addBots", count: 3 });
    await host({ type: "start" });
    expect((await engine.displayView(code)).submittedCount).toBe(0);
    clock += 25_000;
    expect((await engine.displayView(code)).submittedCount).toBe(3);
    await host({ type: "reveal" });
    await host({ type: "reset", keepTeams: true });
    const v = await engine.displayView(code);
    expect(v).toMatchObject({ phase: "lobby", index: -1, teamCount: 0 });
  });

  it("only allows lineup edits in the lobby", async () => {
    const { host } = await setup();
    await host({ type: "setLineup", lineup: ["judges", "not-a-category", "kings"] });
    await host({ type: "start" });
    await expectError(host({ type: "shuffleLineup" }), 409);
  });
});
