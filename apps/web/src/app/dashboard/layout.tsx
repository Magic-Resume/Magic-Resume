import { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardSidebar from "./_components/DashboardSidebar";
import AccountUiHost from "@/components/providers/AccountUiHost";
import ReferralClaimer from "@/components/account/invite/ReferralClaimer";
import TermsGuard from "@/components/account/TermsGuard";
import OnboardingGate from "@/components/account/OnboardingGate";
import metaConfig from "@/lib/constants/metaConfig";
import { isCloudMode } from "@/lib/config/app";
import { hasBetaAccess } from "@/lib/auth/betaAccess";

export const metadata: Metadata = metaConfig.Dashboard;

// Beta gate for the whole app: signed-in-but-not-whitelisted users are sent to
// the coming-soon page. Middleware still handles "signed-out → Clerk"; this
// single server-component guard covers all of /dashboard/*.
export default async function DashboardLayout({
  children,
  modal
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  if (isCloudMode && !(await hasBetaAccess())) redirect("/coming-soon");
  return (
    <div className="flex h-screen bg-desk text-white overflow-hidden">
      <ReferralClaimer />
      {/* 两道进门时的补齐：条款同意落库（登录页勾的那一下要等到有身份才写得进去），
          以及没有求职画像的人送去引导。都只在明确的服务端答案下动作，问不到就沉默。 */}
      <TermsGuard />
      <OnboardingGate />
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
        {modal}
      </div>
      {/* Global settings + account overlays (cover dashboard and editor) */}
      <AccountUiHost />
    </div>
  );
}
