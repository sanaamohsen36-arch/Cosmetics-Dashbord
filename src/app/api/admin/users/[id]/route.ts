import { NextResponse } from "next/server";
import { ApiError, getServiceClient, handleApiError, requireOwner } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const VALID_ROLES = ["owner", "admin", "marketing_manager", "media_buyer", "sales_manager", "data_entry", "viewer"];
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
