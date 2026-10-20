import { z } from 'zod';
import type { Release, ReleaseSlide } from '@/components/announcements/whats-new';

const relativeHref = z.string().max(500).regex(/^\/(?!\/)[^\\\s]*$/u);
const action = z.object({ label: z.string().min(1).max(40), href: relativeHref });
export const presentationSchema = z.object({
  kind: z.literal('whats-new'), schemaVersion: z.literal(1), version: z.string().min(1).max(40).optional(),
  slides: z.array(z.object({
    id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/u),
    category: z.enum(['feature', 'improvement']), title: z.string().min(2).max(120),
    description: z.string().min(2).max(1000), highlights: z.array(z.string().max(200)).max(6),
    image: z.object({ src: z.string().max(2000).regex(/^(?:https:\/\/[^\s\\]+|\/(?!\/)[^\s\\]*)$/u), alt: z.string().min(1).max(200) }).optional(),
    action: action.optional(),
  })).min(1).max(8),
});
export type AnnouncementPresentation = z.infer<typeof presentationSchema>;

export function toRelease(announcement: { title?: string; summary: string; publishedAt?: string | null; presentation?: unknown; actionLabel?: string | null; actionUrl?: string | null }, fallbackDate: string, language: string): Release | null {
  const parsed = presentationSchema.safeParse(announcement.presentation);
  if (!parsed.success) return null;
  const presentation = parsed.data;
  const date = new Date(announcement.publishedAt || fallbackDate);
  if (Number.isNaN(date.getTime())) return null;
  const changelog = action.safeParse({ label: announcement.actionLabel, href: announcement.actionUrl });
  return {
    ...(changelog.success ? { changelog: changelog.data } : {}),
    label: announcement.title?.trim() || presentation.version || (language === 'zh' ? '产品公告' : 'Announcement'),
    date: new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' }).format(date),
    summary: announcement.summary,
    slides: presentation.slides.map(slide => ({ ...slide, category: slide.category === 'feature' ? 'New feature' : 'Improvement' })) as [ReleaseSlide, ...ReleaseSlide[]],
  };
}
