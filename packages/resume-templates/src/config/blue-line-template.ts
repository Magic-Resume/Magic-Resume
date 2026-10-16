import type { MagicTemplateDSL } from '../types/magic-dsl';
import { blueLineHeaderPreset, blueLineSectionPreset, type BlueLineSectionKey } from '../primitives/presets/blueLine';

const sections: Array<[BlueLineSectionKey, string]> = [
  ['education', '教育经历'], ['skills', '专业技能'], ['experience', '工作经历'], ['projects', '项目经历'], ['openSource', '开源贡献'],
  ['summary', '个人总结'], ['personalEvaluation', '个人评价'], ['profiles', '社交主页'], ['languages', '语言能力'], ['awards', '获奖经历'], ['certificates', '证书资质'],
];

export const blueLineTemplate: MagicTemplateDSL = {
  id: 'blue-line', name: 'Blue Line', version: '1.0.0',
  description: 'Single-column resume with blue section dividers, a prominent role heading, and crisp, readable typography.',
  thumbnailUrl: '/templates/jpg/blue-line.jpg',
  tags: ['single-column', 'professional', 'minimal', 'blue', 'ats-friendly'],
  status: 'PUBLISHED', createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z',
  designTokens: {
    colors: { primary: '#0879ee', secondary: '#080808', text: '#3f3f46', textSecondary: '#52525b', background: '#ffffff', border: '#0879ee' },
    typography: {
      fontFamily: { primary: 'Source Han Sans SC' },
      fontSize: { xs: '12px', sm: '13.2px', md: '14.4px', lg: '21px', xl: '24px', xxl: '30px' },
      fontWeight: { normal: 400, medium: 400, bold: 700 }, lineHeight: 1.65, letterSpacing: '0px',
    },
    spacing: { xs: '3px', sm: '8px', md: '13px', lg: '20px', xl: '24px' },
    borderRadius: { none: '0', sm: '0', md: '0', lg: '0' },
  },
  layout: { type: 'single-column', pageSize: 'A4', containerWidth: '794px', padding: '44px', gap: '20px', showTitleDivider: true, showTitleIcon: false },
  components: [
    { id: 'header', type: 'Tree', dataBinding: 'info', position: { area: 'main' }, tree: blueLineHeaderPreset() },
    ...sections.map(([key, title]) => ({
      id: `${key}-section`, type: 'Tree' as const, dataBinding: `sections.${key}`,
      position: { area: 'main' as const }, props: { title }, tree: blueLineSectionPreset(key, title),
    })),
  ],
};
