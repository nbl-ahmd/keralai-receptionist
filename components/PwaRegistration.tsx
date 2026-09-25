"use client";

import { useEffect } from "react";

/**
 * Registers the dashboard service worker so the app is installable.
 *
 * The worker (`public/sw.js`) only caches immutable build assets and icons, so
 * registration is safe for authenticated sessions. We skip registration during
 * development to avoid serving stale `/_next/static` chunks while iterating.
 */
export default function PwaRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures must never break the app.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}