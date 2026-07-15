"use client";

import { useEffect, useState } from "react";
import { Pencil, Save, Trash2, UserPlus, Users as UsersIcon, X } from "lucide-react";
import type { MultiRole, Role, Workspace } from "../../types";
import { isAuthEnabled } from "../../lib/auth";
import { allMultiRoles, allRoles, multiRoleLabels, ROLE_CAPABILITIES, can, roleLabels } from "../../lib/permissions";
import { WORKSPACES } from "../../lib/workspaces";
import { Badge, MultiSelectDropdown, SimpleTable } from "../../lib/ui";
import { deleteUser, inviteUser, listAllUsers, updateUser, type AdminUser } from "../../lib/adminUsers";

export function UsersPage({ currentUserId }: { currentUserId: string | null }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [workspaces, setWorkspaces] = useState<Workspace[]>(["cosmetics"]);
  const [roles, setRoles] = useState<MultiRole[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWorkspaces, setEditWorkspaces] = useState<Workspace[]>([]);
  const [editRoles, setEditRoles] = useState<MultiRole[]>([]);

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
      await inviteUser({ email: email.trim(), displayName: displayName.trim() || email.trim(), role, workspace: workspaces[0] ?? "cosmetics", roles, workspaces });
      setMessage(`تم إرسال دعوة إلى ${email.trim()}.`);
      setEmail("");
      setDisplayName("");
      setRole("viewer");
      setWorkspaces(["cosmetics"]);
      setRoles([]);
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

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setEditWorkspaces(user.workspaces?.length ? user.workspaces : [user.workspace]);
    setEditRoles(user.roles ?? []);
  };

  const saveEdit = async (id: string) => {
    setError("");
    try {
      await updateUser(id, { workspaces: editWorkspaces, roles: editRoles });
      setUsers((prev) => prev.map((item) => (item.id === id ? { ...item, workspaces: editWorkspaces, roles: editRoles } : item)));
      setEditingId(null);
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

  // Permanent delete, never a disable - the Auth user and profile row are
  // both removed, so the email is free to invite again later.
  const removeUser = async (id: string) => {
    const confirmed = window.confirm("Are you sure you want to permanently delete this user?");
    if (!confirmed) return;
    setError("");
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((item) => item.id !== id));
      setMessage("تم حذف المستخدم بنجاح.");
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
            <p>إدارة المستخدمين، Workspace Access، والـ Roles - متاحة لـ Owner فقط. الحذف نهائي ويحرر البريد الإلكتروني لدعوة جديدة لاحقًا.</p>
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
          <MultiSelectDropdown
            label="Workspace Access"
            options={WORKSPACES.map((item) => item.key)}
            selected={workspaces}
            onChange={(value) => setWorkspaces(value as Workspace[])}
          />
          <MultiSelectDropdown
            label="Roles"
            options={allMultiRoles}
            selected={roles}
            onChange={(value) => setRoles(value as MultiRole[])}
          />
          <button className="primary" disabled={!isAuthEnabled || creating || !email.trim()} onClick={createUser}>
            <UserPlus size={18} />
            {creating ? "..." : "Create User"}
          </button>
        </div>
        <p className="status-line">إنشاء المستخدم يرسل دعوة بالبريد الإلكتروني لتعيين كلمة المرور - لا تُدخل أي كلمة مرور هنا.</p>
      </section>

      <SimpleTable title="Users" headers={["Name", "Email", "Role", "Workspace Access", "Roles", "Status", "Last Login", "Actions"]}>
        {loading ? (
          <tr><td colSpan={8}>Loading...</td></tr>
        ) : users.length === 0 ? (
          <tr><td colSpan={8}>لا يوجد مستخدمون بعد.</td></tr>
        ) : (
          users.map((user) => {
            const ownerCount = users.filter((item) => item.role === "owner").length;
            const isSelf = user.id === currentUserId;
            const isLastOwner = user.role === "owner" && ownerCount <= 1;
            const isEditing = editingId === user.id;
            const userWorkspaces = user.workspaces?.length ? user.workspaces : [user.workspace];
            return (
              <tr key={user.id}>
                <td>{user.displayName}</td>
                <td>{user.email}</td>
                <td>
                  <select value={user.role} onChange={(event) => changeRole(user.id, event.target.value as Role)}>
                    {allRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
                  </select>
                </td>
                <td>
                  {isEditing ? (
                    <MultiSelectDropdown
                      label=""
                      options={WORKSPACES.map((item) => item.key)}
                      selected={editWorkspaces}
                      onChange={(value) => setEditWorkspaces(value as Workspace[])}
                    />
                  ) : user.role === "owner" ? (
                    <Badge text="All workspaces" />
                  ) : userWorkspaces.length ? (
                    userWorkspaces.map((item) => <Badge key={item} text={WORKSPACES.find((ws) => ws.key === item)?.label ?? item} />)
                  ) : (
                    <Badge text="None" />
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <MultiSelectDropdown
                      label=""
                      options={allMultiRoles}
                      selected={editRoles}
                      onChange={(value) => setEditRoles(value as MultiRole[])}
                    />
                  ) : user.role === "owner" ? (
                    <Badge text="All roles" />
                  ) : user.roles?.length ? (
                    user.roles.map((item) => <Badge key={item} text={multiRoleLabels[item]} />)
                  ) : (
                    <Badge text="None" />
                  )}
                </td>
                <td><Badge text={user.active ? "Active" : "Disabled"} /></td>
                <td>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString("ar-EG") : "لم يسجل دخول بعد"}</td>
                <td className="actions">
                  {isEditing ? (
                    <>
                      <button className="ghost" onClick={() => saveEdit(user.id)}>
                        <Save size={16} />
                        Save
                      </button>
                      <button className="ghost" onClick={() => setEditingId(null)}>
                        <X size={16} />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="ghost" disabled={user.role === "owner"} onClick={() => startEdit(user)}>
                      <Pencil size={16} />
                      Edit
                    </button>
                  )}
                  <button className="ghost" onClick={() => renameUser(user.id, user.displayName)}>Rename</button>
                  <button
                    className="ghost"
                    disabled={isSelf || isLastOwner}
                    title={isSelf ? "لا يمكنك حذف حسابك الحالي." : isLastOwner ? "لا يمكن حذف آخر Owner." : undefined}
                    onClick={() => removeUser(user.id)}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </td>
              </tr>
            );
          })
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
