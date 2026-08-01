import { MagicTemplateDSL } from '../types/magic-dsl';

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

export const timelineProTemplate: MagicTemplateDSL = {
  id: 'timeline-pro',
  name: 'Timeline',
  version: '1.0.0',
  description: 'Career-progression focused single-column with section icons and a teal accent',
  thumbnailUrl: '/thumbnails/timeline-pro.png',
  tags: ['timeline', 'teal', 'modern', 'icons'],
  status: 'PUBLISHED',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',

  designTokens: {
    colors: {
      primary: '#0d9488',
      secondary: '#0f766e',
      text: '#0f172a',
      textSecondary: '#4b5563',
      background: '#ffffff',
      border: '#d5dbe0',
      accent: '#0d9488',
    },
    typography: {
      fontFamily: { primary: '"Inter", "Helvetica Neue", Arial, sans-serif' },
      fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '16px', xl: '19px', xxl: '24px' },
      fontWeight: { normal: 400, medium: 600, bold: 700 },
      lineHeight: 1.5,
      letterSpacing: '0px',
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '0.85rem', lg: '1rem', xl: '1.5rem' },
    borderRadius: { none: '0', sm: '2px', md: '4px', lg: '6px' },
  },

  layout: {
    type: 'single-column',
    containerWidth: '794px',
    padding: '36px',
    gap: '15px',
    showTitleDivider: true,
    showTitleIcon: true,
  },

  components: [
    { id: 'header', type: 'Header', dataBinding: 'info', position: { area: 'main' }, props: { title: 'Header' }, style: { marginBottom: '4px' } },
    { id: 'experience', type: 'Timeline', dataBinding: 'sections.experience', position: { area: 'main' }, props: { title: 'Experience' }, fieldMap: tlField },
    { id: 'projects', type: 'Timeline', dataBinding: 'sections.projects', position: { area: 'main' }, props: { title: 'Projects' }, fieldMap: tlField },
    { id: 'education', type: 'Timeline', dataBinding: 'sections.education', position: { area: 'main' }, props: { title: 'Education' }, fieldMap: tlField },
    { id: 'skills', type: 'ListSection', dataBinding: 'sections.skills', position: { area: 'main' }, props: { title: 'Skills' }, fieldMap: listField },
    { id: 'languages', type: 'ListSection', dataBinding: 'sections.languages', position: { area: 'main' }, props: { title: 'Languages' }, fieldMap: listField },
    { id: 'certificates', type: 'ListSection', dataBinding: 'sections.certificates', position: { area: 'main' }, props: { title: 'Certificates' }, fieldMap: listField },
    { id: 'awards', type: 'ListSection', dataBinding: 'sections.awards', position: { area: 'main' }, props: { title: 'Awards' }, fieldMap: listField },
    { id: 'profiles', type: 'ListSection', dataBinding: 'sections.profiles', position: { area: 'main' }, props: { title: 'Profiles' }, fieldMap: listField },
  ],
};
