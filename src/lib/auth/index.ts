import type { Profile, Role } from "../../types";
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
  role: row.role as Role,
  active: Boolean(row.active),
  createdAt: row.created_at
});

// Fetches the current session's profile, creating a default one (role:
// viewer) on first login if none exists yet. An Owner promotes new users
// via Settings (settings.manage_users) - nothing here can self-grant a
// higher role.
export const getCurrentProfile = async (): Promise<Profile | null> => {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (data) return fromProfileRow(data);

  const displayName = sessionData.session?.user.email ?? "New user";
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: userId, display_name: displayName, role: "viewer", active: true })
    .select()
    .single();
  if (insertError) throw insertError;
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
