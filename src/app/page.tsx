"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthEnabled } from "../lib/auth";
import { useAuthGate } from "../lib/auth/useAuthGate";
import { LoginForm } from "../features/auth";

// Section 20 (Multi-Workspace): login no longer lands directly on a
// dashboard - every session goes through /workspace (the Workspace
// Selection screen) first, even when only one workspace is available.
export default function Page() {
  const { profile, authChecked, authError } = useAuthGate();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthEnabled || (authChecked && profile)) router.replace("/workspace");
  }, [authChecked, profile, router]);

  if (isAuthEnabled && !authChecked) return null;
  if (isAuthEnabled && !profile) return <LoginForm errorMessage={authError} onSignedIn={() => undefined} />;
  return null;
}
