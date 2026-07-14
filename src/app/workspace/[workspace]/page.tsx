import { isValidWorkspace } from "../../../lib/workspaces";
import { WorkspaceGuard } from "../../../features/workspace";
import DashboardApp from "../../../App";

export default function WorkspaceDashboardPage({ params }: { params: { workspace: string } }) {
  if (!isValidWorkspace(params.workspace)) {
    return (
      <div className="app-shell dark" dir="rtl" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p>Unknown workspace: {params.workspace}</p>
      </div>
    );
  }

  return (
    <WorkspaceGuard workspace={params.workspace}>
      <DashboardApp workspace={params.workspace} />
    </WorkspaceGuard>
  );
}
