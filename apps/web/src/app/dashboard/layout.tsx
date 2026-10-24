import { Metadata } from "next";
import DashboardSidebar from "./_components/DashboardSidebar";
import SettingsHost from "@/components/settings/SettingsHost";
import metaConfig from "@/lib/constants/metaConfig";

export const metadata: Metadata = metaConfig.Dashboard;

export default function DashboardLayout({
  children,
  modal
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-desk text-white overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
        {modal}
      </div>
      {/* Settings dialog for the dashboard and the editor */}
      <SettingsHost />
    </div>
  );
}
