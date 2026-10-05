import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerUpdate } from "@/components/pwa/ServiceWorkerUpdate";

// Inter for UI/body text, Plus Jakarta Sans for display/headings — a common
// pairing that reads as a considered product rather than a default template.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://keralai-receptionist.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "KeralAI — Your personal AI phone assistant",
    template: "%s · KeralAI",
  },
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jakarta.variable} font-sans text-foreground`}>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerUpdate />
      </body>
    </html>
  );
}
