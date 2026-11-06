import type { Metadata } from "next";

// Route group: the Leviathan pages keep their short URLs (/join, /play/CODE, …)
// but share this title. The landing page lives at /leviathan.
export const metadata: Metadata = {
  title: "Leviathan · ENC",
  description: "A team trivia game where the rarest correct answer wins.",
};

export default function LeviathanLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
