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

export const cnFormalPhotoTemplate: MagicTemplateDSL = {
  id: 'cn-formal-photo',
  name: '中文正装照',
  version: '1.0.0',
  description: 'Formal Chinese single-column with a rectangular ID photo and space for 政治面貌 / 籍贯 fields',
  thumbnailUrl: '/thumbnails/cn-formal-photo.png',
  tags: ['chinese', 'photo', 'formal', 'compact', 'ats-friendly'],
  status: 'PUBLISHED',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',

  designTokens: {
    colors: {
      primary: '#1d4ed8',
      secondary: '#1e3a8a',
      text: '#111827',
      textSecondary: '#4b5563',
      background: '#ffffff',
      border: '#cbd5e1',
      accent: '#1d4ed8',
    },
    typography: {
      fontFamily: { primary: '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif' },
      fontSize: { xs: '9px', sm: '11px', md: '13px', lg: '15px', xl: '17px', xxl: '22px' },
      fontWeight: { normal: 400, medium: 600, bold: 700 },
      lineHeight: 1.45,
      letterSpacing: '0px',
    },
    spacing: { xs: '0.2rem', sm: '0.4rem', md: '0.6rem', lg: '0.7rem', xl: '1rem' },
    borderRadius: { none: '0', sm: '2px', md: '3px', lg: '4px' },
  },

  layout: {
    type: 'single-column',
    containerWidth: '794px',
    padding: '30px',
    gap: '10px',
    showTitleDivider: true,
    showTitleIcon: true,
  },

  components: [
    {
      id: 'header',
      type: 'CenteredPhotoHeader',
      dataBinding: 'info',
      position: { area: 'main' },
      props: {
        title: 'Header',
        avatarWidth: 84,
        avatarHeight: 112,
        avatarRounded: false,
        showCustomFields: true,
      },
    },
    { id: 'education', type: 'DefaultSection', dataBinding: 'sections.education', position: { area: 'main' }, props: { title: 'Education' }, fieldMap: expField },
    { id: 'experience', type: 'DefaultSection', dataBinding: 'sections.experience', position: { area: 'main' }, props: { title: 'Experience' }, fieldMap: expField },
    { id: 'projects', type: 'DefaultSection', dataBinding: 'sections.projects', position: { area: 'main' }, props: { title: 'Projects' }, fieldMap: expField },
    { id: 'skills', type: 'ListSection', dataBinding: 'sections.skills', position: { area: 'main' }, props: { title: 'Skills' }, fieldMap: listField },
    { id: 'languages', type: 'ListSection', dataBinding: 'sections.languages', position: { area: 'main' }, props: { title: 'Languages' }, fieldMap: listField },
    { id: 'certificates', type: 'ListSection', dataBinding: 'sections.certificates', position: { area: 'main' }, props: { title: 'Certificates' }, fieldMap: listField },
    { id: 'awards', type: 'ListSection', dataBinding: 'sections.awards', position: { area: 'main' }, props: { title: 'Awards' }, fieldMap: listField },
    { id: 'profiles', type: 'ListSection', dataBinding: 'sections.profiles', position: { area: 'main' }, props: { title: 'Profiles' }, fieldMap: listField },
  ],
};
