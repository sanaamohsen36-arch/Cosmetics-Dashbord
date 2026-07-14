import { createClient } from "@supabase/supabase-js";

// Server-only. SUPABASE_SERVICE_ROLE_KEY must never be exposed to the
// browser (no NEXT_PUBLIC_ prefix) - it bypasses RLS entirely. Only used
// from src/app/api/admin/* route handlers, never imported by client code.
//
// Deliberately NOT read into module-level consts: a serverless function
// instance can stay warm across many invocations, and a top-level const
// would freeze whatever process.env looked like at that instance's cold
// start. Reading process.env fresh inside each function call means every
// request reflects the environment as configured right now.
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// No pre-flight "is it configured" guess here - that generic message can
// mask what's actually wrong (e.g. a key that's present but invalid/wrong-
// project). createClient() is called unconditionally with whatever
// process.env has right now; if the key is genuinely missing or malformed,
// the Supabase SDK's own error - or the real error from the first API call
// that uses this client - is what reaches the caller and, from there, the
// Users page.
export const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.error("getServiceClient env check", { hasSupabaseUrl: Boolean(supabaseUrl), hasServiceRoleKey: Boolean(serviceRoleKey) });
  return createClient(supabaseUrl ?? "", serviceRoleKey ?? "", {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

// Verifies the request's bearer token against the caller's OWN session (RLS-
// safe - never trusts a client-supplied role claim), then checks their
// profile role is exactly "owner". This is the real access boundary for
// every /api/admin/users route; the Users page UI hiding is convenience only.
export const requireOwner = async (request: Request): Promise<{ userId: string }> => {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ApiError(401, "Missing session token.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new ApiError(500, "Supabase is not configured.");

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) {
    console.error("requireOwner: getUser failed", userError);
    throw new ApiError(401, userError?.message || "Invalid or expired session.");
  }

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("requireOwner: profile lookup failed", profileError);
    throw new ApiError(500, profileError.message);
  }
  if (!profile || profile.role !== "owner") throw new ApiError(403, "Owner role required.");

  return { userId: userData.user.id };
};

// Section 20 (Multi-Workspace) API helper, ready for Phase 2's Home-workspace
// routes: verifies the caller's own session same as requireOwner, then
// confirms their profile can access the given workspace (owner bypasses,
// everyone else must match profile.workspace). No workspace-scoped route
// exists yet in Phase 1 - Home has no backend - but any future one should
// call this before touching workspace-scoped data.
export const requireWorkspaceAccess = async (request: Request, workspace: string): Promise<{ userId: string }> => {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ApiError(401, "Missing session token.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new ApiError(500, "Supabase is not configured.");

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) throw new ApiError(401, userError?.message || "Invalid or expired session.");

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role, workspace")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw new ApiError(500, profileError.message);
  if (!profile) throw new ApiError(403, "No profile found for this session.");
  if (profile.role !== "owner" && profile.workspace !== workspace) {
    throw new ApiError(403, `Forbidden: this account cannot access the ${workspace} workspace.`);
  }

  return { userId: userData.user.id };
};

export const handleApiError = (error: unknown) => {
  console.error("admin API error", error);
  if (error instanceof ApiError) return { status: error.status, body: { error: error.message } };
  return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } };
};
