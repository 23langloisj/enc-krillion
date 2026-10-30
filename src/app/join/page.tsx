"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ErrorNote, Logo } from "@/components/ui";
import { api, keys, readLocal, writeLocal } from "@/lib/client";

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("reason"));

  // Already on a team in this game? Go straight back to it.
  useEffect(() => {
    const c = (params.get("code") ?? "").toUpperCase();
    if (c.length === 4 && readLocal(keys.team(c)) && !params.get("reason")) router.replace(`/play/${c}`);
  }, [params, router]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const c = code.trim().toUpperCase();
    try {
      const res = await api<{ code: string; token: string }>(`/api/games/${c}/join`, {
        json: { name, token: readLocal(keys.team(c)) ?? undefined },
      });
      writeLocal(keys.team(res.code), res.token);
      router.push(`/play/${res.code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={join} className="card flex w-full max-w-sm flex-col gap-4 p-6">
      <Logo className="text-center text-4xl" />
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
        <span className="text-sm font-semibold text-mist">Team name</span>
        <input
          className="input text-lg"
          maxLength={24}
          placeholder="e.g. The Prodigal Puns"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <button className="btn-primary py-3 text-lg" disabled={busy || code.length !== 4 || !name.trim()}>
        {busy ? "Joining…" : "Let's fish"}
      </button>
      <ErrorNote message={error} />
      <p className="text-center text-xs text-mist">One phone per team — this one submits for everybody.</p>
    </form>
  );
}

export default function JoinPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Suspense>
        <JoinForm />
      </Suspense>
    </main>
  );
}
