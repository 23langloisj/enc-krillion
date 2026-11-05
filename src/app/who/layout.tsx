import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Who Said That?! · ENC",
  description: "An icebreaker: everyone shares a surprising fact, then the room guesses whose it is.",
};

export default function WhoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
