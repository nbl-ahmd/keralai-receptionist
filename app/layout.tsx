import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import PwaRegistration from "@/components/PwaRegistration";

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
  applicationName: "KeralAI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KeralAI",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#059669",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plus.variable} font-sans text-slate-900`}>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
