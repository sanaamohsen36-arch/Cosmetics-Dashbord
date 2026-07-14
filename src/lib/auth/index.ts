import type { Profile, Role, Workspace } from "../../types";
import { isSupabaseConfigured, supabase } from "../supabase/client";

// Auth is only meaningful when Supabase is configured - in local-fallback
// mode (no NEXT_PUBLIC_SUPABASE_* vars) the app has no login at all, same
// as every other Supabase-only feature in this codebase.
export const isAuthEnabled = isSupabaseConfigured;

export const signInWithPassword = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};

export const onAuthStateChange = (callback: (userId: string | null) => void) => {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
};

const fromProfileRow = (row: any): Profile => ({
  id: row.id,
  displayName: row.display_name || "",
  email: row.email || "",
  role: row.role as Role,
  // Existing rows predate the workspace column - default to "cosmetics" (the
  // one workspace with real data today) so every current user's access is
  // unchanged until an Owner assigns them elsewhere.
  workspace: (row.workspace as Workspace) || "cosmetics",
  active: Boolean(row.active),
  createdAt: row.created_at
});

// Fetches the current session's profile, creating a default one (role:
// viewer) on first login if none exists yet. An Owner promotes new users
// via the Users page (users.manage) - nothing here can self-grant a higher
// role.
export const getCurrentProfile = async (): Promise<Profile | null> => {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (data) return fromProfileRow(data);

  // Two callers (initial mount + the SIGNED_IN auth event) can race here on
  // first login - upsert with ignoreDuplicates instead of insert so the
  // loser hits no-op instead of a unique-violation exception, then re-select.
  const email = sessionData.session?.user.email ?? "";
  const displayName = email || "New user";
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, display_name: displayName, email, role: "viewer", workspace: "cosmetics", active: true },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (upsertError) throw upsertError;

  const { data: created, error: refetchError } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (refetchError) throw refetchError;
  return fromProfileRow(created);
};

export const listProfiles = async (): Promise<Profile[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromProfileRow);
};

export const updateProfileRole = async (profileId: string, role: Role): Promise<void> => {
  if (!supabase) return;
  const { error } = await supabase.from("profiles").update({ role }).eq("id", profileId);
  if (error) throw error;
};
