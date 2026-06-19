"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

// Single shared client. NEXT_PUBLIC_CONVEX_URL is set in .env.local.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Wraps the app so Convex Auth tokens are sent with every request. This is the
 * new auth path (Convex). The legacy Supabase AuthProvider still lives inside
 * during the rebuild; remove it once pages are migrated (Phase 8).
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
