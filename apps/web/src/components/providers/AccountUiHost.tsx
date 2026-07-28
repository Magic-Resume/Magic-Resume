"use client";

import { SettingsModal } from "@/components/settings/SettingsModal";
import { AccountModal } from "@/lib/auth";
import { PricingModal } from "@/lib/extensions/billing-ui";

/**
 * Mounts the global settings + account + pricing overlays once, high in the
 * dashboard tree so they render over both the dashboard and the editor. Driven
 * by useAccountUiStore. Account/Pricing are no-ops in self-hosted mode.
 */
export default function AccountUiHost() {
  return (
    <>
      <SettingsModal />
      <AccountModal />
      <PricingModal />
    </>
  );
}
