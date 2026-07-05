"use client";

import { ShieldOff } from "lucide-react";

// The real access boundary is the capability check in App.tsx that decides
// whether to render this instead of the page - not a hidden button. Every
// page (including this one being reachable at all) goes through that check.
export function ForbiddenPage({ pageLabel }: { pageLabel: string }) {
  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-title">
          <ShieldOff />
          <div>
            <h2>403 - Access Denied</h2>
            <p>ليس لديك صلاحية الوصول إلى صفحة {pageLabel}. تواصلي مع Owner إذا كنتِ تحتاجين هذه الصلاحية.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
