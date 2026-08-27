"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import OutlineRail, { LEFT_PANEL_WIDTH } from "./OutlineRail";

type EditorFormPanelProps = {
  renderSections: () => React.ReactNode;
  /**
   * `icon` 不能省。上一次修这个 bug 只补到了 `OutlineRail` 的 props，而 `sectionOrder`
   * 是**经这里透传**下去的——TS 的对象字面量类型会把多出来的属性直接丢掉，于是自定义
   * section 在表单里是用户选的图标、在侧栏里是一张通用文档纸，一模一样的症状又回来了。
   *
   * 透传层写窄类型就是这个后果：它不报错，只是安静地少带一个字段。
   */
  sectionOrder?: { key: string; label: string; icon?: string }[];
  activeSection?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onJump?: (key: string) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  /** 移动端抽屉内嵌:无图标轨、无折叠、占满容器 */
  embedded?: boolean;
};

export default function EditorFormPanel({
  renderSections,
  sectionOrder = [],
  activeSection = "",
  collapsed = false,
  onToggleCollapse = () => {},
  onJump = () => {},
  scrollRef,
  onScroll,
  embedded = false,
}: EditorFormPanelProps) {
  const { t } = useTranslation();

  if (embedded) {
    return (
      <div className="flex h-full w-full flex-col bg-desk">
        <div className="flex items-center border-b border-white/[0.06] px-4 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-white">{t("outline.title")}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 scrollbar-hide">
          {renderSections()}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed left-0 top-0 z-40 flex h-screen">
      <OutlineRail
        sectionOrder={sectionOrder}
        activeSection={activeSection}
        collapsed={collapsed}
        onJump={onJump}
        onToggleCollapse={onToggleCollapse}
      />

      <motion.div
        className="h-full overflow-hidden border-r border-white/[0.06] bg-desk"
        animate={{ width: collapsed ? 0 : LEFT_PANEL_WIDTH }}
        initial={false}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
      >
        <div style={{ width: LEFT_PANEL_WIDTH }} className="flex h-full flex-col">
          <div className="flex items-center border-b border-white/[0.06] px-4 py-4">
            <h2 className="text-[15px] font-semibold tracking-tight text-white">{t("outline.title")}</h2>
          </div>
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 scrollbar-hide"
          >
            {renderSections()}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
