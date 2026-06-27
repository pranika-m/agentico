import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// Display face: a geometric grotesk with a slightly mechanical edge — used
// sparingly for page titles and big numbers, echoing the "audit-grade
// precision" the product is built around.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Body face: a warm, rounded humanist sans so the dense data tables don't
// read as cold despite the ops/audit subject matter.
const manrope = Manrope({
  variable: "--font-body-face",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Agentico - Autonomous Support",
  description: "Audit-friendly workspace for autonomous support operations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${manrope.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
