"use client";

import React from "react";
import {
  User,
  FileText,
  BriefcaseBusiness,
  GraduationCap,
  FolderKanban,
  Zap,
  Certificate,
  Languages,
  Contact,
} from '@magic-resume/icons';
import { useTranslation } from "react-i18next";
import { sectionIconByName } from "@magic-resume/resume-templates";
import { cn } from "@/lib/utils";
import { MaskIcon } from "@/components/icons/MaskIcon";
import AccountMenu from "@/components/shared/AccountMenu";

export const LEFT_RAIL_WIDTH = 52;
// 与右侧自定义面板等宽(rail 52 + panel 360 = 412),保证展开时左右对称
export const LEFT_PANEL_WIDTH = 360;
/** 左侧整体宽度 = 画布的 marginLeft,与右侧 rightPanelWidth 同构 */
export const leftPanelWidth = (collapsed: boolean) =>
  collapsed ? LEFT_RAIL_WIDTH : LEFT_RAIL_WIDTH + LEFT_PANEL_WIDTH;

type Meta = { icon: React.ComponentType<{ size?: number | string; className?: string }>; labelKey?: string };

const SECTION_META: Record<string, Meta> = {
  basics: { icon: User, labelKey: "editPage.sections.basics" },
  summary: { icon: FileText, labelKey: "sections.summary" },
  experience: { icon: BriefcaseBusiness, labelKey: "sections.experience" },
  education: { icon: GraduationCap, labelKey: "sections.education" },
  projects: { icon: FolderKanban, labelKey: "sections.projects" },
  skills: { icon: Zap, labelKey: "sections.skills" },
  languages: { icon: Languages, labelKey: "sections.languages" },
  certificates: { icon: Certificate, labelKey: "sections.certificates" },
  profiles: { icon: Contact, labelKey: "sections.profiles" },
};

/**
 * Icon and label for a section in the editor.
 *
 * `iconName` is the user's explicit choice from `sectionOrder.icon`; it
 * outranks the built-in map so a section wears the same icon in the form as it
 * does on the rendered page — both resolve through `sectionIconByName`.
 * `FileText` remains the last resort for a custom section nobody has styled.
 */
export function sectionMeta(key: string, iconName?: string): Meta {
  // `hasOwn`, not `??`: `key` is resume data, and inherited members are truthy.
  const known = Object.hasOwn(SECTION_META, key) ? SECTION_META[key] : undefined;
  const chosen = sectionIconByName(iconName);
  if (chosen) return { ...(known ?? {}), icon: chosen };
  return known ?? { icon: FileText };
}

type OutlineRailProps = {
  /**
   * `icon` 不能省：它是用户在 `sectionOrder.icon` 里挑的那枚。这个 props 类型此前只
   * 声明了 key/label，于是侧栏拿不到它、`sectionMeta` 退回 `FileText`——同一个自定义
   * section 在表单里是用户选的图标，在侧栏里是一张通用文档纸。
   */
  sectionOrder: { key: string; label: string; icon?: string }[];
  activeSection: string;
  collapsed: boolean;
  onJump: (key: string) => void;
  onToggleCollapse: () => void;
};

export default function OutlineRail({
  sectionOrder,
  activeSection,
  collapsed,
  onJump,
  onToggleCollapse,
}: OutlineRailProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-full shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] bg-desk py-3"
      style={{ width: LEFT_RAIL_WIDTH }}
    >
      <RailButton
        label={collapsed ? t("common.expand") : t("common.collapse")}
        onClick={onToggleCollapse}
      >
        <MaskIcon src="/marks/sidebar.svg" size={20} className="block" />
      </RailButton>

      <div className="my-1.5 h-px w-6 bg-white/[0.08]" />

      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-hide">
        {sectionOrder.map(({ key, label, icon: iconName }) => {
          const meta = sectionMeta(key, iconName);
          const Icon = meta.icon;
          const name = meta.labelKey ? t(meta.labelKey) : label;
          return (
            <RailButton
              key={key}
              label={name}
              active={!collapsed && activeSection === key}
              onClick={() => onJump(key)}
            >
              <Icon size={18} />
            </RailButton>
          );
        })}
      </div>

      <div className="mt-2 flex shrink-0 flex-col items-center gap-2.5 pt-2">
        <div className="h-px w-6 bg-white/[0.08]" />
        <AccountMenu placement="right" />
      </div>
    </div>
  );
}

function RailButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150",
        active ? "bg-sky-400/10 text-sky-300" : "text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200",
      )}
    >
      {children}
      {active && (
        <span className="absolute -right-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-sky-400" />
      )}
      <span className="pointer-events-none absolute left-11 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}
