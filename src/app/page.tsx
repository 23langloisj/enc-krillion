"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorNote, Logo, TIER_TEXT } from "@/components/ui";
import { api, keys, writeLocal } from "@/lib/client";
import { TIERS, TIER_IDS } from "@/lib/tiers";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function host(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ code: string; hostKey: string }>("/api/games", { json: { password } });
      writeLocal(keys.host(res.code), res.hostKey);
      router.push(`/host/${res.code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-10 px-4 py-12">
      <header className="text-center">
        <p className="mb-2 text-sm font-semibold tracking-[0.3em] text-mist uppercase">ENC game night</p>
        <Logo className="text-6xl sm:text-7xl" />
        <p className="mx-auto mt-4 max-w-md text-lg text-mist">
          Name the <em className="text-foam">rarest</em> right answer. The deeper you fish, the more you catch.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <form
          className="card flex flex-col gap-3 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/join${code ? `?code=${encodeURIComponent(code.toUpperCase())}` : ""}`);
          }}
        >
          <h2 className="font-display text-2xl font-bold">Join a team</h2>
          <p className="text-sm text-mist">One phone per team. Grab the code off the projector.</p>
          <input
            className="input text-center font-display text-2xl tracking-[0.4em] uppercase"
            placeholder="CODE"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, ""))}
            aria-label="Room code"
          />
          <button className="btn-primary">Join</button>
        </form>

        <form className="card flex flex-col gap-3 p-6" onSubmit={host}>
          <h2 className="font-display text-2xl font-bold">Host a game</h2>
          <p className="text-sm text-mist">Runs on your laptop; put the display view on the projector.</p>
          <input
            className="input"
            type="password"
            placeholder="Host password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Host password"
          />
          <button className="btn-ghost" disabled={busy}>
            {busy ? "Creating…" : "Create game"}
          </button>
          <ErrorNote message={error} />
        </form>
      </div>

      <section className="card p-6">
        <h2 className="mb-3 font-display text-xl font-bold">How scoring works</h2>
        <p className="mb-4 text-sm text-mist">
          3 rounds · 7 categories each · 25 seconds per category. Every right answer has a rarity tier, set ahead of
          time. Wrong or blank answers score nothing.
        </p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {TIER_IDS.map((id) => (
            <li key={id} className="flex items-baseline justify-between rounded-lg bg-white/5 px-3 py-2">
              <span className={`font-semibold ${TIER_TEXT[id]}`}>{TIERS[id].label}</span>
              <span className="font-display font-bold tabular-nums">{TIERS[id].points}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-center text-xs text-mist/70">
        <Link href="/join" className="underline-offset-4 hover:underline">
          Join
        </Link>{" "}
        · “Can you draw out Leviathan with a fishhook?” — Job 41:1
      </footer>
    </main>
  );
}
