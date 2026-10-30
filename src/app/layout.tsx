import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "Leviathan · ENC",
  description: "A team trivia game where the rarest correct answer wins.",
};

export const viewport: Viewport = { themeColor: "#040b1a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${pixel.variable} ${mono.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
