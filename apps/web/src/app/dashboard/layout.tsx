import { Metadata } from "next";
import DashboardHeader from "./_components/DashboardHeader";
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
    <div className="flex h-screen flex-col bg-desk text-white overflow-hidden">
      <DashboardHeader />
      <div className="flex min-h-0 flex-1 flex-col">
        {children}
        {modal}
      </div>
      {/* Settings dialog for the dashboard and the editor */}
      <SettingsHost />
    </div>
  );
}
