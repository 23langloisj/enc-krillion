import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "ENC.ICE",
  description: "Icebreaker games for ENC game night.",
};

export const viewport: Viewport = { themeColor: "#040b1a", width: "device-width", initialScale: 1 };

// Runs before paint so there's no flash of the normal theme. Thanksgiving turns
// on automatically for all of November; ?theme=thanksgiving|normal|auto
// overrides it and sticks in this browser (anything else counts as auto).
const themeScript = `try{var q=new URLSearchParams(location.search).get("theme");if(q)localStorage.setItem("enc-theme",q);var t=localStorage.getItem("enc-theme");if(t!=="thanksgiving"&&t!=="normal")t="auto";if(t==="thanksgiving"||(t==="auto"&&new Date().getMonth()===10))document.documentElement.classList.add("thanksgiving")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${display.variable} ${body.variable} ${pixel.variable} ${mono.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
