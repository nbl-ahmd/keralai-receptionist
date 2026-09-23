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
  title: "KeralAI Receptionist",
  description: "Premium AI receptionist console built for modern hospitality teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plus.variable} font-sans bg-slate-50`}>{children}</body>
    </html>
  );
}
