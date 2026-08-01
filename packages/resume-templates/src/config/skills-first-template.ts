import { MagicTemplateDSL } from '../types/magic-dsl';

const expField = {
  mainTitle: ['company', 'project', 'school', 'name', 'title', 'platform'],
  mainSubtitle: ['location', 'major'],
  secondarySubtitle: [],
  sideTitle: ['date'],
  sideSubtitle: ['position', 'degree', 'role'],
  secondarySideSubtitle: [],
  description: ['summary', 'description'],
};
const skillField = { title: ['skill', 'name', 'language', 'certificate'], level: ['level'] };
const listField = {
  itemName: ['skill', 'award', 'language', 'certificate', 'name', 'title'],
  itemDetail: ['level'],
  date: ['date'],
  summary: ['summary'],
};

export const skillsFirstTemplate: MagicTemplateDSL = {
  id: 'skills-first',
  name: 'Skill Bars',
  version: '1.0.0',
  description: 'Single-column that visualizes skills and languages as proficiency bars, with a burgundy accent',
  thumbnailUrl: '/thumbnails/skills-first.png',
  tags: ['skills', 'visual', 'bars', 'burgundy'],
  status: 'PUBLISHED',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',

  designTokens: {
    colors: {
      primary: '#9f1239',
      secondary: '#881337',
      text: '#1f2937',
      textSecondary: '#6b7280',
      background: '#ffffff',
      border: '#e5e7eb',
      accent: '#9f1239',
    },
    typography: {
      fontFamily: { primary: '"Inter", "Helvetica Neue", Arial, sans-serif' },
      fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '16px', xl: '19px', xxl: '25px' },
      fontWeight: { normal: 400, medium: 600, bold: 700 },
      lineHeight: 1.5,
      letterSpacing: '0px',
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '0.9rem', lg: '1.1rem', xl: '1.5rem' },
    borderRadius: { none: '0', sm: '3px', md: '6px', lg: '8px' },
  },

  layout: {
    type: 'single-column',
    containerWidth: '794px',
    padding: '38px',
    gap: '16px',
    showTitleDivider: true,
    showTitleIcon: true,
  },

  components: [
    { id: 'header', type: 'Header', dataBinding: 'info', position: { area: 'main' }, props: { title: 'Header' }, style: { marginBottom: '4px' } },
    { id: 'skills', type: 'CompactList', dataBinding: 'sections.skills', position: { area: 'main' }, props: { title: 'Skills', levelBar: true }, fieldMap: skillField },
    { id: 'experience', type: 'DefaultSection', dataBinding: 'sections.experience', position: { area: 'main' }, props: { title: 'Experience' }, fieldMap: expField },
    { id: 'projects', type: 'DefaultSection', dataBinding: 'sections.projects', position: { area: 'main' }, props: { title: 'Projects' }, fieldMap: expField },
    { id: 'education', type: 'DefaultSection', dataBinding: 'sections.education', position: { area: 'main' }, props: { title: 'Education' }, fieldMap: expField },
    { id: 'languages', type: 'CompactList', dataBinding: 'sections.languages', position: { area: 'main' }, props: { title: 'Languages', levelBar: true }, fieldMap: skillField },
    { id: 'certificates', type: 'ListSection', dataBinding: 'sections.certificates', position: { area: 'main' }, props: { title: 'Certificates' }, fieldMap: listField },
    { id: 'awards', type: 'ListSection', dataBinding: 'sections.awards', position: { area: 'main' }, props: { title: 'Awards' }, fieldMap: listField },
    { id: 'profiles', type: 'ListSection', dataBinding: 'sections.profiles', position: { area: 'main' }, props: { title: 'Profiles' }, fieldMap: listField },
  ],
};
