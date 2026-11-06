"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ErrorNote } from "@/components/ui";
import { FactsEditor, WhoLogo } from "@/components/who";
import { api, readLocal, writeLocal } from "@/lib/client";
import { whoKeys } from "@/lib/who-client";
import { factsProblem } from "@/lib/who-rules";

const FACT_IDEAS = [
  "I once got chased by monkeys on vacation.",
  "I've been on TV.",
  "I can name every book of the Bible in order.",
  "I've never seen Star Wars.",
];

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [facts, setFacts] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("reason"));
  const [idea, setIdea] = useState(FACT_IDEAS[0]);
  // Random example only after mount, so server and client render the same HTML.
  useEffect(() => setIdea(FACT_IDEAS[Math.floor(Math.random() * FACT_IDEAS.length)]), []);

  // Already in this game on this phone? Go straight back.
  useEffect(() => {
    const c = (params.get("code") ?? "").toUpperCase();
    if (c.length === 4 && readLocal(whoKeys.player(c)) && !params.get("reason")) router.replace(`/who/play/${c}`);
  }, [params, router]);

  // Say why the button is off instead of leaving people guessing.
  const missing =
    code.length !== 4 ? "Enter the 4-letter room code." : !name.trim() ? "Enter your name." : factsProblem(facts);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const c = code.trim().toUpperCase();
    try {
      const res = await api<{ code: string; token: string }>(`/api/who/${c}/join`, {
        json: { name, facts, token: readLocal(whoKeys.player(c)) ?? undefined },
      });
      writeLocal(whoKeys.player(res.code), res.token);
      router.push(`/who/play/${res.code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={join} className="card flex w-full max-w-sm flex-col gap-4 p-6">
      <WhoLogo className="text-center text-4xl" />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-mist">Room code</span>
        <input
          className="input text-center font-display text-3xl tracking-[0.4em] uppercase"
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, "").toUpperCase())}
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-mist">Your name</span>
        <input className="input text-lg" maxLength={24} placeholder="First name (+ last initial)" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-mist">Surprising facts about you (1–3)</span>
        <FactsEditor facts={facts} onChange={setFacts} placeholder={`e.g. ${idea}`} />
        <span className="text-xs text-mist">
          Write them in first person. Pick things people won&apos;t instantly guess! More facts = more chances for your
          story to come up.
        </span>
      </div>
      <button className="btn-primary py-3 text-lg" disabled={busy || !!missing}>
        {busy ? "Joining…" : "I'm in"}
      </button>
      {missing && !error && <p className="-mt-2 text-center text-sm text-mist">{missing}</p>}
      <ErrorNote message={error} />
    </form>
  );
}

export default function WhoJoinPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Suspense>
        <JoinForm />
      </Suspense>
    </main>
  );
}
