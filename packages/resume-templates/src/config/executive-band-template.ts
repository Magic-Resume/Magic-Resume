import { MagicTemplateDSL } from '../types/magic-dsl';

// 时间轴用 title/subtitle/date/description 字段;宽松覆盖各分区常见键
const tlField = {
  title: ['company', 'school', 'name', 'project', 'platform'],
  subtitle: ['position', 'degree', 'role', 'major'],
  date: ['date'],
  description: ['summary', 'description'],
};
const listField = {
  itemName: ['skill', 'award', 'language', 'certificate', 'name', 'title'],
  itemDetail: ['level'],
  date: ['date'],
  summary: ['summary'],
};

export const executiveBandTemplate: MagicTemplateDSL = {
  id: 'executive-band',
  name: 'Executive',
  version: '1.0.0',
  description: 'Corporate single-column with a shaded header band and a clean career timeline',
  thumbnailUrl: '/thumbnails/executive-band.png',
  tags: ['executive', 'navy', 'timeline', 'professional'],
  status: 'PUBLISHED',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',

  designTokens: {
    colors: {
      primary: '#1e40af',
      secondary: '#1e3a8a',
      text: '#0f172a',
      textSecondary: '#475569',
      background: '#ffffff',
      border: '#dbe4f2',
      accent: '#1e40af',
    },
    typography: {
      fontFamily: { primary: '"Inter", "Helvetica Neue", Arial, sans-serif' },
      fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '17px', xl: '20px', xxl: '27px' },
      fontWeight: { normal: 400, medium: 600, bold: 700 },
      lineHeight: 1.55,
      letterSpacing: '0px',
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.25rem', xl: '1.75rem' },
    borderRadius: { none: '0', sm: '4px', md: '8px', lg: '12px' },
  },

  layout: {
    type: 'single-column',
    containerWidth: '794px',
    padding: '40px',
    gap: '18px',
    showTitleDivider: true,
    showTitleIcon: false,
  },

  components: [
    {
      id: 'header',
      type: 'Header',
      dataBinding: 'info',
      position: { area: 'main' },
      props: { title: 'Header' },
      style: {
        backgroundColor: '#eef4ff',
        color: '#0f172a',
        padding: '16px',
        borderRadius: '10px',
        marginBottom: '6px',
      },
    },
    { id: 'experience', type: 'Timeline', dataBinding: 'sections.experience', position: { area: 'main' }, props: { title: 'Experience' }, fieldMap: tlField },
    { id: 'education', type: 'Timeline', dataBinding: 'sections.education', position: { area: 'main' }, props: { title: 'Education' }, fieldMap: tlField },
    { id: 'projects', type: 'Timeline', dataBinding: 'sections.projects', position: { area: 'main' }, props: { title: 'Projects' }, fieldMap: tlField },
    { id: 'skills', type: 'ListSection', dataBinding: 'sections.skills', position: { area: 'main' }, props: { title: 'Skills' }, fieldMap: listField },
    { id: 'languages', type: 'ListSection', dataBinding: 'sections.languages', position: { area: 'main' }, props: { title: 'Languages' }, fieldMap: listField },
    { id: 'certificates', type: 'ListSection', dataBinding: 'sections.certificates', position: { area: 'main' }, props: { title: 'Certificates' }, fieldMap: listField },
    { id: 'awards', type: 'ListSection', dataBinding: 'sections.awards', position: { area: 'main' }, props: { title: 'Awards' }, fieldMap: listField },
    { id: 'profiles', type: 'ListSection', dataBinding: 'sections.profiles', position: { area: 'main' }, props: { title: 'Profiles' }, fieldMap: listField },
  ],
};
