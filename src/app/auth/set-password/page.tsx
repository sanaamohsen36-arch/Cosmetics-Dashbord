"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "../../../lib/supabase/client";

// Landing page for the Supabase invite-email link (redirectTo, set in
// /api/admin/users' inviteUserByEmail call). supabase-js auto-detects the
// invite token in the URL and establishes a session before this ever
// renders (detectSessionInUrl is on by default), so by the time the user
// submits, updateUser({ password }) applies to that invited account.
export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSessionReady(Boolean(data.session)));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionReady(Boolean(session));
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    if (!supabase) return;
    setError("");
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      window.location.href = "/?activated=1";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <div className="app-shell login-shell" dir="rtl">
      <form
        className="panel login-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="section-title">
          <KeyRound />
          <div>
            <h2>تعيين كلمة المرور</h2>
            <p>Sales + Ads BI Dashboard</p>
          </div>
        </div>
        {!sessionReady && <p className="status-line">جارٍ التحقق من رابط الدعوة...</p>}
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            disabled={!sessionReady}
          />
        </label>
        <label>
          Confirm Password
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={6}
            disabled={!sessionReady}
          />
        </label>
        {error && <p className="error-note">{error}</p>}
        <button className="primary" type="submit" disabled={loading || !sessionReady}>
          {loading ? "..." : "Set Password"}
        </button>
      </form>
    </div>
  );
}
