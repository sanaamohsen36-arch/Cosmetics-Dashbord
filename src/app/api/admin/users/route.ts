import { NextResponse } from "next/server";
import { ApiError, getServiceClient, handleApiError, requireOwner } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
// Never let Next's Full Route Cache or a CDN serve a stale response for
// this - every call must re-check the caller's live session/role and the
// server's current env, not a cached result from an earlier deployment.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const VALID_ROLES = ["owner", "admin", "marketing_manager", "media_buyer", "sales_manager", "data_entry", "viewer"];

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const serviceClient = getServiceClient();

    const [{ data: authUsers, error: authError }, { data: profileRows, error: profileError }] = await Promise.all([
      serviceClient.auth.admin.listUsers({ perPage: 200 }),
      serviceClient.from("profiles").select("*")
    ]);
    if (authError) throw new ApiError(500, authError.message);
    if (profileError) throw new ApiError(500, profileError.message);

    const profileById = new Map((profileRows ?? []).map((row: any) => [row.id, row]));
    const users = authUsers.users.map((user) => {
      const profile = profileById.get(user.id);
      return {
        id: user.id,
        email: user.email ?? profile?.email ?? "",
        displayName: profile?.display_name ?? user.email ?? "",
        role: profile?.role ?? "viewer",
        active: profile ? Boolean(profile.active) : true,
        lastSignInAt: user.last_sign_in_at ?? null,
        createdAt: profile?.created_at ?? user.created_at
      };
    });

    return NextResponse.json(users);
  } catch (error) {
    const { status, body } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const body = await request.json().catch(() => null);
    const email = String(body?.email ?? "").trim();
    const displayName = String(body?.displayName ?? "").trim() || email;
    const role = String(body?.role ?? "viewer");
    if (!email) throw new ApiError(400, "Email is required.");
    if (!VALID_ROLES.includes(role)) throw new ApiError(400, `Invalid role: ${role}`);

    const serviceClient = getServiceClient();

    // Invite instead of creating with a password: the new user sets their
    // own password via the emailed link, so no temporary/plaintext password
    // ever exists on this server or in this UI. redirectTo points the link
    // at our own Set Password page instead of Supabase's default page - it
    // must be added to Supabase Auth > URL Configuration > Redirect URLs.
    const redirectTo = `${new URL(request.url).origin}/auth/set-password`;
    const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteError) throw new ApiError(400, inviteError.message);
    const userId = invited.user.id;

    const { error: profileError } = await serviceClient
      .from("profiles")
      .upsert({ id: userId, display_name: displayName, email, role, active: true }, { onConflict: "id" });
    if (profileError) throw new ApiError(500, profileError.message);

    return NextResponse.json({
      id: userId,
      email,
      displayName,
      role,
      active: true,
      lastSignInAt: null,
      createdAt: invited.user.created_at
    });
  } catch (error) {
    const { status, body } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}
