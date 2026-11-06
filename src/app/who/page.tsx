"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorNote } from "@/components/ui";
import { OPTION_STYLE, WhoLogo } from "@/components/who";
import { api, writeLocal } from "@/lib/client";
import { whoKeys } from "@/lib/who-client";

export default function WhoHome() {
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
      const res = await api<{ code: string; hostKey: string }>("/api/who", { json: { password } });
      writeLocal(whoKeys.host(res.code), res.hostKey);
      router.push(`/who/host/${res.code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-12">
      <header className="text-center">
        <WhoLogo className="text-5xl sm:text-7xl" />
        <p className="mx-auto mt-4 max-w-md text-lg text-mist">
          Everyone shares one surprising fact. Then the whole room guesses whose it is.
        </p>
        <div className="mt-5 flex justify-center gap-2" aria-hidden>
          {OPTION_STYLE.map((o) => (
            <span key={o.letter} className="grid h-10 w-10 place-items-center rounded-lg text-xl text-white" style={{ background: o.bg }}>
              {o.shape}
            </span>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <form
          className="card flex flex-col gap-3 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/who/join${code ? `?code=${encodeURIComponent(code.toUpperCase())}` : ""}`);
          }}
        >
          <h2 className="font-display text-2xl font-bold">Join</h2>
          <p className="text-sm text-mist">Grab the code off the screen (or just scan the QR).</p>
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
          <h2 className="font-display text-2xl font-bold">Host</h2>
          <p className="text-sm text-mist">Runs on your laptop; put the projector view on the big screen.</p>
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

      <section className="card p-6 text-sm text-mist">
        <h2 className="mb-2 font-display text-xl font-bold text-foam">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Scan the QR as you arrive: your name plus one surprising fact.</li>
          <li>Each question shows a fact and four people. Guess whose it is (20 seconds).</li>
          <li>If it&apos;s your fact, you sit that one out. Keep a straight face.</li>
          <li>Reveal, then the owner gets ~20 seconds to tell the story.</li>
          <li>One point per correct guess. Leaderboard every 3 questions.</li>
        </ol>
      </section>

      <footer className="text-center text-xs text-mist/70">
        <Link href="/" className="underline-offset-4 hover:underline">
          ← All games
        </Link>
      </footer>
    </main>
  );
}
