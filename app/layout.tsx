import type { Metadata } from "next";
import { Alegreya, Inter, Space_Mono } from "next/font/google";
import "./globals.css";

// Same type system as creeptee.com: Alegreya headings, Space Mono labels, Inter body.
const display = Alegreya({ variable: "--font-display", subsets: ["latin"], weight: ["600", "800"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const mono = Space_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "CREEPTEE HQ",
  description: "Sales, ads and fulfillment for CREEPTEE in one place.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
