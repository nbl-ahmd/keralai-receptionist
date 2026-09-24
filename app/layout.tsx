import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plus = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://keralai-receptionist.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "KeralAI — Your personal AI phone assistant",
  description:
    "KeralAI answers your calls, understands Malayalam, English and Manglish, takes messages, and keeps you informed when you're unavailable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plus.variable} font-sans text-slate-900`}>{children}</body>
    </html>
  );
}
