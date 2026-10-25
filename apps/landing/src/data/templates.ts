import { templateIds, sampleResume, type Resume, type TemplateId } from '@magic-resume-kit/resume-schema';
import { templateRegistry } from '@magic-resume-kit/resume-templates/registry';
import type { Locale } from '@/i18n/ui';

export { templateIds };
// Editorial recommendations based on the registry's layout and emphasis, not ATS rankings.
export function templateFacts(id: TemplateId, locale: Locale) {
  const manifest = templateRegistry[id];
  const twoColumn = manifest.template.layout.type === 'two-column';
  const tags = manifest.tags;
  const zh = locale === 'zh';
  const roles = id === 'product-ops-focus' ? (zh ? '产品经理、运营' : 'Product management, operations')
    : tags.includes('executive') ? (zh ? '管理岗位、团队负责人' : 'Management, team leadership')
    : tags.includes('skills') ? (zh ? '技术岗位、技能型岗位' : 'Engineering, technical specialists')
    : tags.includes('photo') ? (zh ? '明确要求照片的行政、客户服务岗位' : 'Administration or customer service where a photo is requested')
    : twoColumn ? (zh ? '设计、市场、产品岗位' : 'Design, marketing, product roles')
    : (zh ? '工程、分析、运营岗位' : 'Engineering, analysis, operations');
  return { ...manifest, twoColumn, roles };
}

export function previewResume(id: TemplateId, locale: Locale): Resume {
  const zh = locale === 'zh';
  return {
    ...sampleResume,
    template: id,
    documentLanguage: locale,
    info: { ...sampleResume.info, fullName: zh ? '陈小明' : 'Alex Chen', headline: zh ? '前端工程师 · 合成示例' : 'Frontend Engineer · Synthetic sample' },
    sections: {
      ...sampleResume.sections,
      education: [{ id: 'education-demo', visible: true, school: zh ? '示例大学' : 'Example University', degree: zh ? '计算机科学学士' : 'BSc Computer Science', date: '2019 – 2023' }],
      experience: [{ id: 'experience-demo', visible: true, company: zh ? '示例科技' : 'Example Studio', position: zh ? '前端工程师' : 'Frontend Engineer', date: '2023 – 2026', summary: zh ? '<ul><li>开发键盘可访问的简历编辑流程，补充交互回归测试。</li><li>与设计和产品团队合作，将用户反馈转化为发布计划。</li></ul>' : '<ul><li>Built keyboard-accessible resume editing flows and interaction regression tests.</li><li>Worked with design and product teams to turn user feedback into releases.</li></ul>' }],
      projects: [{ id: 'project-demo', visible: true, name: zh ? '求职进度看板' : 'Application tracker', role: zh ? '开发者' : 'Developer', summary: zh ? '<p>使用 TypeScript 构建岗位进度看板，支持筛选与导出。</p>' : '<p>Built a TypeScript application tracker with filtering and export.</p>' }],
      skills: [{ id: 'skills-demo', visible: true, name: 'TypeScript · React · CSS', level: 'Advanced' }],
      languages: [{ id: 'languages-demo', visible: true, name: zh ? '英语' : 'English', level: 'Professional' }],
    },
  };
}
