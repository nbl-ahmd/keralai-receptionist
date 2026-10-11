"use client";

/**
 * lib/auth/client.ts
 *
 * Browser-side Better Auth client. No secret is ever referenced here.
 */

import { createAuthClient } from "better-auth/react";

// Browser requests follow the current origin; the server validates its canonical origin.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
