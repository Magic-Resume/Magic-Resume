import { MagicTemplateDSL } from '../types/magic-dsl';

const tlField = {
  title: ['company', 'school', 'name', 'project', 'platform'],
  subtitle: ['position', 'degree', 'role', 'major'],
  date: ['date'],
  description: ['summary', 'description'],
};
const skillField = { title: ['skill', 'name', 'language', 'certificate'], level: ['level'] };
const listField = {
  itemName: ['skill', 'award', 'language', 'certificate', 'name', 'title'],
  itemDetail: ['level'],
  date: ['date'],
  summary: ['summary'],
};

export const slateSidebarTemplate: MagicTemplateDSL = {
  id: 'slate-sidebar',
  name: 'Slate',
  version: '1.0.0',
  description: 'Two-column with a dark slate sidebar, circular photo, proficiency bars, and a main-column timeline',
  thumbnailUrl: '/thumbnails/slate-sidebar.png',
  tags: ['two-column', 'dark', 'slate', 'photo', 'visual'],
  status: 'PUBLISHED',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',

  designTokens: {
    colors: {
      primary: '#0ea5e9',
      secondary: '#0284c7',
      text: '#0f172a',
      textSecondary: '#475569',
      background: '#ffffff',
      border: '#e2e8f0',
      accent: '#0ea5e9',
      sidebar: '#1e293b',
    },
    typography: {
      fontFamily: { primary: '"Inter", "Helvetica Neue", Arial, sans-serif' },
      fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '16px', xl: '19px', xxl: '23px' },
      fontWeight: { normal: 400, medium: 600, bold: 700 },
      lineHeight: 1.5,
      letterSpacing: '0px',
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '0.9rem', lg: '1.1rem', xl: '1.5rem' },
    borderRadius: { none: '0', sm: '4px', md: '8px', lg: '12px' },
  },

  layout: {
    type: 'two-column',
    containerWidth: '794px',
    padding: '28px',
    gap: '18px',
    twoColumn: { leftWidth: '260px', rightWidth: '1fr', gap: '0' },
    showTitleDivider: true,
    showTitleIcon: true,
  },

  components: [
    { id: 'profile-card', type: 'ProfileCard', dataBinding: 'info', position: { area: 'sidebar', order: 0 }, props: { title: 'Profile' } },
    { id: 'contact-info', type: 'ContactInfo', dataBinding: 'info', position: { area: 'sidebar', order: 1 }, props: { title: 'Contact' } },
    { id: 'skills', type: 'CompactList', dataBinding: 'sections.skills', position: { area: 'sidebar', order: 2 }, props: { title: 'Skills', levelBar: true }, fieldMap: skillField },
    { id: 'languages', type: 'CompactList', dataBinding: 'sections.languages', position: { area: 'sidebar', order: 3 }, props: { title: 'Languages', levelBar: true }, fieldMap: skillField },
    { id: 'certificates-side', type: 'CompactList', dataBinding: 'sections.certificates', position: { area: 'sidebar', order: 4 }, props: { title: 'Certificates' }, fieldMap: skillField },

    { id: 'experience', type: 'Timeline', dataBinding: 'sections.experience', position: { area: 'main' }, props: { title: 'Experience' }, fieldMap: tlField },
    { id: 'projects', type: 'Timeline', dataBinding: 'sections.projects', position: { area: 'main' }, props: { title: 'Projects' }, fieldMap: tlField },
    { id: 'education', type: 'Timeline', dataBinding: 'sections.education', position: { area: 'main' }, props: { title: 'Education' }, fieldMap: tlField },
    { id: 'awards', type: 'ListSection', dataBinding: 'sections.awards', position: { area: 'main' }, props: { title: 'Awards' }, fieldMap: listField },
    { id: 'profiles', type: 'ListSection', dataBinding: 'sections.profiles', position: { area: 'main' }, props: { title: 'Profiles' }, fieldMap: listField },
  ],
};
