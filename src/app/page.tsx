'use client';

import { WorkspaceDashboard } from '@/components/WorkspaceDashboard';
import { GentosActivitySidebar } from '@/components/GentosActivitySidebar';

export default function HomePage() {
  return (
    <div className="flex">
      <div className="flex-1 min-w-0">
        <WorkspaceDashboard />
      </div>
      <GentosActivitySidebar />
    </div>
  );
}
