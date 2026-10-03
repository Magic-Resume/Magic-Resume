'use client';

import { useEffect, useMemo, useState } from 'react';
import { notFound } from 'next/navigation';
import { magicTemplates } from '@magic-resume/resume-templates/config/magic-templates';
import { MagicResumeRenderer } from '@magic-resume/resume-templates/renderer/MagicResumeRenderer';
import { defaultResume } from '@magic-resume/resume-schema';
import type { Resume } from '@/types/frontend/resume';
import { useTheme } from '@/components/providers/ThemeProvider';
import i18n from '@/i18n';
import ColorSettings from '@/app/dashboard/edit/_components/templates/ColorSettings';
import { haveSameColors } from '@/app/dashboard/edit/_components/templates/colorSchemes';

// Development-only visual fixture. All edits stay in component state; this page
// never reads or writes the user's resume store, IndexedDB, or cloud documents.
const sample: Resume = {
  ...defaultResume,
  id: 'color-preview',
  updatedAt: 0,
  name: '配色预览',
  info: { ...defaultResume.info, fullName: '陈映舟', headline: '前端工程师', email: 'yingzhou@example.com', address: '深圳' },
  sections: {
    ...defaultResume.sections,
    education: [{ id: 'education-preview', visible: true, school: '深圳大学', major: '软件工程', degree: '本科', date: '2018.09 — 2022.06', summary: '<p>计算机科学、交互设计与软件工程。</p>' }],
    experience: [{ id: 'experience-preview', visible: true, company: '映川科技', position: '前端工程师', date: '2022.07 — 至今', location: '深圳', summary: '<ul><li>负责在线文档工作台与协作编辑体验，完成组件库设计及性能优化。</li><li>优化渲染与资源加载，核心页面交互延迟降低 32%。</li></ul>' }],
    projects: [{ id: 'project-preview', visible: true, name: '协作设计工作台', role: '项目负责人', date: '2025.03 — 2025.12', summary: '<p>构建可复用的颜色、排版与布局配置系统，让内容编辑保持清晰流畅。</p>' }],
  },
  customTemplate: { designTokens: { typography: { lineHeight: 1.65 } }, layout: { padding: '28px' } },
};

export default function TemplateColorsPreview() {
  const [ready, setReady] = useState(false);
  const [templateId, setTemplateId] = useState('classic');
  const [colors, setColors] = useState(magicTemplates.classic.designTokens.colors);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    void i18n.changeLanguage('zh');
    setReady(true);
  }, []);

  const base = magicTemplates[templateId];
  const template = useMemo(() => ({
    ...base,
    layout: { ...base.layout, padding: '28px', containerWidth: '100%' },
    designTokens: { ...base.designTokens, colors, typography: { ...base.designTokens.typography, lineHeight: 1.65 } },
  }), [base, colors]);

  if (process.env.NODE_ENV === 'production') notFound();
  if (!ready) return null;

  return (
    <main className="min-h-dvh bg-mr-desk text-mr-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-mr-line px-6 py-4">
        <div><h1 className="text-base font-semibold">简历配色</h1><p className="mt-1 text-xs text-mr-muted">开发预览 · 使用示例简历</p></div>
        <div className="flex items-center gap-3">
          <select aria-label="预览模板" value={templateId} onChange={(event) => {
            setTemplateId(event.target.value);
            setColors(magicTemplates[event.target.value].designTokens.colors);
          }} className="rounded-lg border border-mr-line bg-mr-surface px-3 py-2 text-sm">
            <option value="classic">Classic</option><option value="slate-sidebar">Slate sidebar</option><option value="gengar">Gengar</option>
          </select>
          <button type="button" className="rounded-lg border border-mr-line px-3 py-2 text-sm" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>切换工作台主题</button>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1240px] items-start gap-8 px-4 py-6 md:grid-cols-[minmax(0,1fr)_360px] md:px-8">
        <div className="min-w-0 overflow-auto rounded-xl border border-mr-line p-5 max-md:hidden">
          <div className="overflow-hidden rounded-md shadow-lg" style={{ backgroundColor: template.designTokens.colors.background }}>
            <MagicResumeRenderer template={template} data={sample} locale="zh" />
          </div>
          <p className="mt-4 text-xs text-mr-muted" data-testid="layout-preservation">行高 {template.designTokens.typography.lineHeight} · 内边距 {template.layout.padding}</p>
        </div>
        <aside className="min-w-0 rounded-2xl border border-mr-line bg-mr-desk p-5">
          <h2 className="mb-5 text-base font-semibold">配色</h2>
          <ColorSettings colors={colors} baseColors={base.designTokens.colors} onChange={(patch) => setColors((current) => ({ ...current, ...patch }))} onReset={() => setColors(base.designTokens.colors)} canReset={!haveSameColors(colors, base.designTokens.colors)} />
        </aside>
      </div>
    </main>
  );
}
