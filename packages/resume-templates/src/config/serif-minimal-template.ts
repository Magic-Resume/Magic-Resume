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
const listField = {
  itemName: ['skill', 'award', 'language', 'certificate', 'name', 'title'],
  itemDetail: ['level'],
  date: ['date'],
  summary: ['summary'],
};

export const serifMinimalTemplate: MagicTemplateDSL = {
  id: 'serif-minimal',
  name: 'Serif Minimal',
  version: '1.0.0',
  description: 'Typography-led, near monochrome serif layout with generous whitespace — premium and ATS-safe',
  thumbnailUrl: '/thumbnails/serif-minimal.png',
  tags: ['serif', 'minimal', 'monochrome', 'ats-friendly'],
  status: 'PUBLISHED',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',

  designTokens: {
    colors: {
      primary: '#1f2937',
      secondary: '#374151',
      text: '#111827',
      textSecondary: '#6b7280',
      background: '#ffffff',
      border: '#d1d5db',
      accent: '#1f2937',
    },
    typography: {
      fontFamily: { primary: '"IBM Plex Serif", Georgia, serif' },
      fontSize: { xs: '10px', sm: '12px', md: '14px', lg: '16px', xl: '19px', xxl: '28px' },
      fontWeight: { normal: 400, medium: 500, bold: 700 },
      lineHeight: 1.7,
      letterSpacing: '0.2px',
    },
    spacing: { xs: '0.3rem', sm: '0.6rem', md: '1.1rem', lg: '1.4rem', xl: '2rem' },
    borderRadius: { none: '0', sm: '0', md: '0', lg: '0' },
  },

  layout: {
    type: 'single-column',
    containerWidth: '794px',
    padding: '52px',
    gap: '22px',
    showTitleDivider: true,
    showTitleIcon: false,
  },

  components: [
    { id: 'header', type: 'Header', dataBinding: 'info', position: { area: 'main' }, props: { title: 'Header' }, style: { marginBottom: '8px' } },
    { id: 'experience', type: 'DefaultSection', dataBinding: 'sections.experience', position: { area: 'main' }, props: { title: 'Experience' }, fieldMap: expField },
    { id: 'education', type: 'DefaultSection', dataBinding: 'sections.education', position: { area: 'main' }, props: { title: 'Education' }, fieldMap: expField },
    { id: 'projects', type: 'DefaultSection', dataBinding: 'sections.projects', position: { area: 'main' }, props: { title: 'Projects' }, fieldMap: expField },
    { id: 'skills', type: 'ListSection', dataBinding: 'sections.skills', position: { area: 'main' }, props: { title: 'Skills' }, fieldMap: listField },
    { id: 'languages', type: 'ListSection', dataBinding: 'sections.languages', position: { area: 'main' }, props: { title: 'Languages' }, fieldMap: listField },
    { id: 'certificates', type: 'ListSection', dataBinding: 'sections.certificates', position: { area: 'main' }, props: { title: 'Certificates' }, fieldMap: listField },
    { id: 'awards', type: 'ListSection', dataBinding: 'sections.awards', position: { area: 'main' }, props: { title: 'Awards' }, fieldMap: listField },
    { id: 'profiles', type: 'ListSection', dataBinding: 'sections.profiles', position: { area: 'main' }, props: { title: 'Profiles' }, fieldMap: listField },
  ],
};
