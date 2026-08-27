import type { Metadata } from 'next';
import metaConfig from '@/lib/constants/metaConfig';

export const metadata: Metadata = metaConfig.Dashboard;

/**
 * 面试页的外壳。
 *
 * 与 `edit/layout.tsx` 同形：撑满视口、不滚动。侧栏是靠 `DashboardSidebar` 自己按
 * pathname 隐藏的（那里已加了 `/interview`）——父级 `dashboard/layout.tsx` 是复合的，
 * route group 挡不住它。
 */
export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-desk text-white">
      {children}
    </div>
  );
}
