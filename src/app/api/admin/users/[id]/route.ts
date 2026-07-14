import { NextResponse } from "next/server";
import { ApiError, getServiceClient, handleApiError, requireOwner } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const VALID_ROLES = ["owner", "admin", "marketing_manager", "media_buyer", "sales_manager", "data_entry", "viewer"];
const VALID_WORKSPACES = ["cosmetics", "home"];
// Effectively permanent (~100 years) - GoTrue's ban mechanism, used instead
// of deleting the user. "none" lifts it. Matches "do not permanently delete
// users": this is fully reversible via Enable.
const BAN_DURATION = "876000h";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { userId: callerId } = await requireOwner(request);
    const targetId = params.id;
    const body = await request.json().catch(() => null);
    const patch: Record<string, unknown> = {};

    if (body?.role !== undefined) {
      const role = String(body.role);
      if (!VALID_ROLES.includes(role)) throw new ApiError(400, `Invalid role: ${role}`);
      patch.role = role;
    }
    if (body?.workspace !== undefined) {
      const workspace = String(body.workspace);
      if (!VALID_WORKSPACES.includes(workspace)) throw new ApiError(400, `Invalid workspace: ${workspace}`);
      patch.workspace = workspace;
    }
    if (body?.displayName !== undefined) {
      patch.display_name = String(body.displayName).trim();
    }
    if (body?.active !== undefined) {
      if (targetId === callerId && body.active === false) {
        throw new ApiError(400, "You cannot disable your own account.");
      }
      patch.active = Boolean(body.active);
    }
    if (Object.keys(patch).length === 0) throw new ApiError(400, "No fields to update.");

    const serviceClient = getServiceClient();

    if (body?.active !== undefined) {
      const { error: banError } = await serviceClient.auth.admin.updateUserById(targetId, {
        ban_duration: body.active ? "none" : BAN_DURATION
      });
      if (banError) throw new ApiError(500, banError.message);
    }

    const { error: profileError } = await serviceClient.from("profiles").update(patch).eq("id", targetId);
    if (profileError) throw new ApiError(500, profileError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}

// Permanent delete - not a disable/ban. Removes the Supabase Auth user
// entirely (frees the email for a future invite) and their profile row.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { userId: callerId } = await requireOwner(request);
    const targetId = params.id;
    if (targetId === callerId) throw new ApiError(400, "You cannot delete your own account.");

    const serviceClient = getServiceClient();

    const { data: targetProfile, error: targetError } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", targetId)
      .maybeSingle();
    if (targetError) throw new ApiError(500, targetError.message);

    if (targetProfile?.role === "owner") {
      const { count, error: countError } = await serviceClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner");
      if (countError) throw new ApiError(500, countError.message);
      if ((count ?? 0) <= 1) throw new ApiError(400, "Cannot delete the last remaining Owner.");
    }

    const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(targetId);
    if (deleteAuthError) throw new ApiError(500, deleteAuthError.message);

    const { error: deleteProfileError } = await serviceClient.from("profiles").delete().eq("id", targetId);
    if (deleteProfileError) throw new ApiError(500, deleteProfileError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}
