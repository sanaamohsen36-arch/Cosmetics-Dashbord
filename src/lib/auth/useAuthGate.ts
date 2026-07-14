"use client";

import { useEffect, useState } from "react";
import type { Profile } from "../../types";
import { getCurrentProfile, isAuthEnabled, onAuthStateChange } from "./index";

// Single source of truth for post-login profile bootstrapping - shared by
// the root page, the workspace selector, and the per-workspace dashboard
// shell so there is one race-safe effect instead of three copies of it.
// Split from ./index (a plain module also imported by server code) since
// this needs client-only hooks.
export const useAuthGate = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authChecked, setAuthChecked] = useState(!isAuthEnabled);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!isAuthEnabled) return;
    const loadProfile = () =>
      getCurrentProfile()
        .then((current) => {
          setProfile(current);
          setAuthError("");
        })
        .catch((error) => setAuthError(error instanceof Error ? error.message : String(error)))
        .finally(() => setAuthChecked(true));

    void loadProfile();
    return onAuthStateChange((userId) => {
      if (!userId) {
        setProfile(null);
        return;
      }
      void loadProfile();
    });
  }, []);

  return { profile, authChecked, authError, setProfile };
};
