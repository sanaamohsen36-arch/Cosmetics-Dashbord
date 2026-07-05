import { NextResponse } from "next/server";
import { ApiError, getServiceClient, handleApiError, requireOwner } from "../../../../../../lib/supabase/admin";

export const runtime = "nodejs";

// Sends a Supabase password-recovery email instead of ever handling a
// plaintext password on this server - the user sets their own new password
// via the emailed link.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireOwner(request);
    const serviceClient = getServiceClient();

    const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(params.id);
    if (userError || !userData.user?.email) throw new ApiError(404, "User not found.");

    const { error } = await serviceClient.auth.resetPasswordForEmail(userData.user.email);
    if (error) throw new ApiError(500, error.message);

    return NextResponse.json({ ok: true, email: userData.user.email });
  } catch (error) {
    const { status, body } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}
