"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAccountUiStore } from "@/store/useAccountUiStore";

/*
 * 四个弹窗都要等用户点开才有用，此前却静态挂在 dashboard 布局里：设置弹窗一路带进了
 * react-markdown 与 react-aria，每个 dashboard 页面的首屏都为它们付了下载和解析；
 * 邀请海报只要有缓存的码，挂载时就合成一张几百 KB 的位图。
 *
 * 现在各自拆成独立 chunk，第一次打开时才挂载，之后保持挂载（关闭动画与内部状态照旧）。
 * 它们的副作用本来就挂在 `*Open` 的上升沿上，挂载即打开，行为不变。浏览器空闲时预取
 * 代码，第一次点开不用等网络。
 */
const loaders = {
  settings: () => import("@/components/settings/SettingsModal"),
  account: () => import("@/lib/auth"),
  pricing: () => import("@/lib/extensions/billing-ui"),
  invite: () => import("@/components/account/invite/InvitePosterModal"),
};

const SettingsModal = dynamic(() => loaders.settings().then((m) => m.SettingsModal), { ssr: false });
const AccountModal = dynamic(() => loaders.account().then((m) => m.AccountModal), { ssr: false });
const PricingModal = dynamic(() => loaders.pricing().then((m) => m.PricingModal), { ssr: false });
const InvitePosterModal = dynamic(() => loaders.invite().then((m) => m.default), { ssr: false });

type Modal = keyof typeof loaders;

function prefetchWhenIdle() {
  const prefetch = () => {
    for (const load of Object.values(loaders)) void load().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(prefetch, 2000);
  return () => window.clearTimeout(id);
}

/**
 * Mounts the global settings + account + pricing overlays once, high in the
 * dashboard tree so they render over both the dashboard and the editor. Driven
 * by useAccountUiStore. Account/Pricing are no-ops in self-hosted mode.
 */
export default function AccountUiHost() {
  const open: Record<Modal, boolean> = {
    settings: useAccountUiStore((s) => s.settingsOpen),
    account: useAccountUiStore((s) => s.accountOpen),
    pricing: useAccountUiStore((s) => s.pricingOpen),
    invite: useAccountUiStore((s) => s.invitePosterOpen),
  };
  const [opened, setOpened] = useState<Record<Modal, boolean>>({
    settings: false,
    account: false,
    pricing: false,
    invite: false,
  });
  // Derived during render rather than in an effect, so the modal mounts in the same commit it is opened.
  const firstOpen = (Object.keys(open) as Modal[]).filter((key) => open[key] && !opened[key]);
  if (firstOpen.length > 0) {
    setOpened((prev) => ({ ...prev, ...Object.fromEntries(firstOpen.map((key) => [key, true])) }));
  }

  useEffect(prefetchWhenIdle, []);

  return (
    <>
      {opened.settings || open.settings ? <SettingsModal /> : null}
      {opened.account || open.account ? <AccountModal /> : null}
      {opened.pricing || open.pricing ? <PricingModal /> : null}
      {opened.invite || open.invite ? <InvitePosterModal /> : null}
    </>
  );
}
