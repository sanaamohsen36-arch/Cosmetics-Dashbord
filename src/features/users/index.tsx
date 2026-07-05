"use client";

import { useEffect, useState } from "react";
import { KeyRound, UserPlus, Users as UsersIcon } from "lucide-react";
import type { Role } from "../../types";
import { isAuthEnabled } from "../../lib/auth";
import { allRoles, ROLE_CAPABILITIES, can, roleLabels } from "../../lib/permissions";
import { Badge, SimpleTable } from "../../lib/ui";
import { inviteUser, listAllUsers, sendPasswordReset, updateUser, type AdminUser } from "../../lib/adminUsers";

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    if (!isAuthEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listAllUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const createUser = async () => {
    if (!email.trim()) return;
    setCreating(true);
    setError("");
    try {
      await inviteUser({ email: email.trim(), displayName: displayName.trim() || email.trim(), role });
      setMessage(`تم إرسال دعوة إلى ${email.trim()}.`);
      setEmail("");
      setDisplayName("");
      setRole("viewer");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const changeRole = async (id: string, newRole: Role) => {
    setError("");
    try {
      await updateUser(id, { role: newRole });
      setUsers((prev) => prev.map((item) => (item.id === id ? { ...item, role: newRole } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    const confirmed = window.confirm(active ? "Disable this user? They will not be able to sign in." : "Enable this user again?");
    if (!confirmed) return;
    setError("");
    try {
      await updateUser(id, { active: !active });
      setUsers((prev) => prev.map((item) => (item.id === id ? { ...item, active: !active } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const renameUser = async (id: string, currentName: string) => {
    const next = window.prompt("Display name", currentName);
    if (next === null || !next.trim() || next.trim() === currentName) return;
    setError("");
    try {
      await updateUser(id, { displayName: next.trim() });
      setUsers((prev) => prev.map((item) => (item.id === id ? { ...item, displayName: next.trim() } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resetPassword = async (id: string, userEmail: string) => {
    const confirmed = window.confirm(`Send a password reset email to ${userEmail}?`);
    if (!confirmed) return;
    setError("");
    try {
      await sendPasswordReset(id);
      setMessage(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${userEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-title">
          <UsersIcon />
          <div>
            <h2>Users</h2>
            <p>إدارة المستخدمين والأدوار - متاحة لـ Owner فقط. لا يتم حذف أي حساب نهائيًا، فقط تعطيله.</p>
          </div>
        </div>
        {!isAuthEnabled && (
          <p className="status-line">Supabase Auth غير مفعّل حاليًا (Local mode) - صفحة المستخدمين تحتاج Supabase Auth ليعمل الإنشاء/التعديل الفعلي.</p>
        )}
        {error && <p className="error-note">{error}</p>}
        {message && <p className="status-line">{message}</p>}
      </section>

      <section className="panel">
        <h2>Create User</h2>
        <div className="form-row">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={!isAuthEnabled} />
          </label>
          <label>
            Name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={!isAuthEnabled} />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} disabled={!isAuthEnabled}>
              {allRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
            </select>
          </label>
          <button className="primary" disabled={!isAuthEnabled || creating || !email.trim()} onClick={createUser}>
            <UserPlus size={18} />
            {creating ? "..." : "Create User"}
          </button>
        </div>
        <p className="status-line">إنشاء المستخدم يرسل دعوة بالبريد الإلكتروني لتعيين كلمة المرور - لا تُدخل أي كلمة مرور هنا.</p>
      </section>

      <SimpleTable title="Users" headers={["Name", "Email", "Role", "Status", "Last Login", "Actions"]}>
        {loading ? (
          <tr><td colSpan={6}>Loading...</td></tr>
        ) : users.length === 0 ? (
          <tr><td colSpan={6}>لا يوجد مستخدمون بعد.</td></tr>
        ) : (
          users.map((user) => (
            <tr key={user.id}>
              <td>{user.displayName}</td>
              <td>{user.email}</td>
              <td>
                <select value={user.role} onChange={(event) => changeRole(user.id, event.target.value as Role)}>
                  {allRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
                </select>
              </td>
              <td><Badge text={user.active ? "Active" : "Disabled"} /></td>
              <td>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString("ar-EG") : "لم يسجل دخول بعد"}</td>
              <td className="actions">
                <button className="ghost" onClick={() => renameUser(user.id, user.displayName)}>Edit</button>
                <button className="ghost" onClick={() => resetPassword(user.id, user.email)}>
                  <KeyRound size={16} />
                  Reset Password
                </button>
                <button className="ghost" onClick={() => toggleActive(user.id, user.active)}>
                  {user.active ? "Disable" : "Enable"}
                </button>
              </td>
            </tr>
          ))
        )}
      </SimpleTable>

      <SimpleTable title="Permission Matrix" headers={["Capability", ...allRoles.map((item) => roleLabels[item])]}>
        {[...new Set(Object.values(ROLE_CAPABILITIES).flat())].sort().map((capability) => (
          <tr key={capability}>
            <td>{capability}</td>
            {allRoles.map((item) => <td key={item}>{can(item, capability) ? "✓" : "—"}</td>)}
          </tr>
        ))}
      </SimpleTable>
    </div>
  );
}
