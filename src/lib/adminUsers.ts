import type { Profile, Role } from "../types";
import { supabase } from "./supabase/client";

// Combined auth.users + profiles shape returned by /api/admin/users - the
// service-role key that makes this possible never leaves the server.
export type AdminUser = Profile;

const authHeader = async (): Promise<Record<string, string>> => {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const readError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => null);
  return new Error(body?.error || fallback);
};

export const listAllUsers = async (): Promise<AdminUser[]> => {
  if (!supabase) return [];
  const response = await fetch("/api/admin/users", { headers: await authHeader(), cache: "no-store" });
  if (!response.ok) throw await readError(response, "Failed to load users.");
  return response.json();
};

export const inviteUser = async (input: { email: string; displayName: string; role: Role }): Promise<AdminUser> => {
  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) throw await readError(response, "Failed to create user.");
  return response.json();
};

export const updateUser = async (id: string, patch: { role?: Role; active?: boolean; displayName?: string }): Promise<void> => {
  const response = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(patch),
    cache: "no-store"
  });
  if (!response.ok) throw await readError(response, "Failed to update user.");
};

export const sendPasswordReset = async (id: string): Promise<void> => {
  const response = await fetch(`/api/admin/users/${id}/reset-password`, {
    method: "POST",
    headers: await authHeader(),
    cache: "no-store"
  });
  if (!response.ok) throw await readError(response, "Failed to send reset email.");
};
