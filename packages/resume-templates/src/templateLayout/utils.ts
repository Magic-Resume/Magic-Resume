import { sectionIconByName, type SectionIconComponent } from '../sectionIcons';
import React from 'react';
// 三个取值/链接函数移到了中立的 `fieldAccess`，两个渲染器共用一份——
// 此前 PDF 侧各写了一份，其中 safeHref 的那份没有拒绝路径，是个 XSS 洞。
// 这里 re-export 以保持既有调用点不变。
export { getFieldValue, getFieldEntry, safeHref } from '../fieldAccess';
import {
  Briefcase, Certificate, GraduationCap, FolderKanban, Wrench,
  Languages, Award, User, Globe,
} from '@magic-resume/icons';

const SECTION_ICON_MAP: Record<string, SectionIconComponent> = {
  experience: Briefcase,
  education: GraduationCap,
  projects: FolderKanban,
  skills: Wrench,
  languages: Languages,
  certificates: Certificate,
  profiles: User,
  contact: Globe,
};

const TITLE_ICON_KEYWORDS: Record<string, SectionIconComponent> = {
  '工作': Briefcase, 'experience': Briefcase, 'work': Briefcase,
  '教育': GraduationCap, 'education': GraduationCap,
  '项目': FolderKanban, 'project': FolderKanban,
  '技能': Wrench, 'skill': Wrench, 'technical': Wrench,
  '语言': Languages, 'language': Languages,
  '证书': Certificate, 'certif': Certificate, 'award': Award,
  '个人': User, 'profile': User, 'summary': User,
  '联系': Globe, 'contact': Globe,
};

export function getSectionIcon(
  sectionKey?: string,
  title?: string,
  /** Explicit choice from `sectionOrder.icon`, when the user made one. */
  iconName?: string,
): SectionIconComponent | null {
  // An explicit choice outranks every guess below it.
  const chosen = sectionIconByName(iconName);
  if (chosen) return chosen;

  if (sectionKey) {
    const icon = SECTION_ICON_MAP[sectionKey];
    if (icon) return icon;
  }

  if (title) {
    const lower = title.toLowerCase();
    for (const [keyword, icon] of Object.entries(TITLE_ICON_KEYWORDS)) {
      if (lower.includes(keyword)) return icon;
    }
  }

  return null;
}
