"use client";

import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { signInWithPassword, signOut } from "../../lib/auth";

export function LoginForm({ onSignedIn, errorMessage }: { onSignedIn: () => void; errorMessage?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set from Set Password page's redirect (window.location.href =
  // "/?activated=1") after an invited user successfully creates their
  // password - plain query-string check, no next/navigation dependency.
  const [justActivated, setJustActivated] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("activated") === "1") {
      setJustActivated(true);
    }
  }, []);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPassword(email, password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول.");
    } finally {
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
          <LogIn />
          <div>
            <h2>تسجيل الدخول</h2>
            <p>Sales + Ads BI Dashboard</p>
          </div>
        </div>
        {justActivated && (
          <p className="notice success-note">Your account has been activated successfully. Please sign in.</p>
        )}
        <label>
          Email
          <input type="email" value={email} autoComplete="username" onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {(error || errorMessage) && <p className="error-note">{error || errorMessage}</p>}
        <button className="primary" type="submit" disabled={loading}>
          {loading ? "..." : "دخول"}
        </button>
      </form>
    </div>
  );
}

export function SignOutButton({ onSignedOut }: { onSignedOut: () => void }) {
  return (
    <button
      className="ghost"
      onClick={() => {
        void signOut().then(onSignedOut);
      }}
    >
      Sign out
    </button>
  );
}
