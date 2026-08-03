import {
  Award,
  Briefcase,
  Code2,
  FileText,
  FolderOpen,
  Globe,
  GraduationCap,
  Heart,
  Languages,
  Lightbulb,
  Rocket,
  Sparkles,
  Star,
  Target,
  Trophy,
  User,
  Wrench,
} from 'lucide-react';
import React from 'react';

export type SectionIconComponent = React.ComponentType<{
  // `string | number` because lucide accepts both and the editor's own `Meta`
  // types it that way; narrowing here would make the shared registry unusable
  // by one of its two consumers.
  size?: string | number;
  className?: string;
  style?: React.CSSProperties;
}>;

/**
 * Icons a section can be given by name.
 *
 * Named rather than stored as a component so the choice survives JSON — a
 * resume is persisted, synced and exported, and none of those can carry a
 * React component. The set is deliberately small: a picker with four hundred
 * lucide icons is a worse experience than one with sixteen that cover what a
 * resume section actually is.
 *
 * Shared by the editor (`sectionMeta`) and the renderer (`getSectionIcon`) so a
 * section cannot wear one icon in the form and another on the page.
 */
export const SECTION_ICONS: Record<string, SectionIconComponent> = {
  briefcase: Briefcase,
  graduation: GraduationCap,
  folder: FolderOpen,
  wrench: Wrench,
  languages: Languages,
  award: Award,
  trophy: Trophy,
  user: User,
  globe: Globe,
  code: Code2,
  rocket: Rocket,
  lightbulb: Lightbulb,
  target: Target,
  star: Star,
  sparkles: Sparkles,
  heart: Heart,
  file: FileText,
};

/** Stable order for the picker — grouped by what they tend to mean. */
export const SECTION_ICON_NAMES = Object.keys(SECTION_ICONS);

/** The component for a stored icon name, or null when unset/unknown. */
export function sectionIconByName(
  name: string | undefined | null,
): SectionIconComponent | null {
  if (!name) return null;
  // `hasOwn`, not `??`: the name is persisted resume data, so `icon: 'constructor'`
  // returned `Object` and React threw on rendering it as a component.
  return Object.hasOwn(SECTION_ICONS, name) ? SECTION_ICONS[name] : null;
}
