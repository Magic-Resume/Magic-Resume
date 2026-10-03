/** Document language is persisted content, independent of the editor's locale. */
export const DOCUMENT_LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number]['value'];
export const documentLanguageIds = ['zh', 'en', 'ja', 'ko', 'fr'] as const;

/** Languages offered by the editor; retain the full registry for existing documents. */
export const DOCUMENT_LANGUAGE_OPTIONS = DOCUMENT_LANGUAGES.filter(
  ({ value }) => value === 'zh' || value === 'en',
);

export function normalizeDocumentLanguage(
  value: unknown,
): DocumentLanguage | undefined {
  if (typeof value !== 'string') return undefined;
  const aliases: Record<string, DocumentLanguage> = {
    chinese: 'zh',
    中文: 'zh',
    简体中文: 'zh',
    english: 'en',
    英文: 'en',
    英语: 'en',
    japanese: 'ja',
    日本語: 'ja',
    日文: 'ja',
    日语: 'ja',
    korean: 'ko',
    한국어: 'ko',
    韩文: 'ko',
    韩语: 'ko',
    french: 'fr',
    français: 'fr',
    法文: 'fr',
    法语: 'fr',
  };
  const key = value.trim().toLowerCase();
  const prefix = key.split(/[-_]/)[0];
  return (
    aliases[key] ?? documentLanguageIds.find((language) => language === prefix)
  );
}

type LanguageDocument = {
  documentLanguage?: string;
  info?: unknown;
  sections?: unknown;
};

/** Inspect prose, not names, links or a list of English technology keywords. */
export function detectDocumentLanguage(
  resume: LanguageDocument,
): DocumentLanguage | undefined {
  const texts: string[] = [];
  if (resume.sections && typeof resume.sections === 'object') {
    for (const [key, items] of Object.entries(resume.sections)) {
      if (
        ['skills', 'languages', 'profiles', 'certificates'].includes(key) ||
        !Array.isArray(items)
      )
        continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const value = item.summary || item.description;
        if (typeof value === 'string') texts.push(value);
      }
    }
  }
  const text = texts
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/&\w+;/g, ' ');
  const han = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  if ((text.match(/[\u3040-\u30ff]/g) ?? []).length >= 3) return 'ja';
  if ((text.match(/[\uac00-\ud7af]/g) ?? []).length >= 3) return 'ko';
  // Chinese prose commonly contains long Latin names such as React/TypeScript.
  if (han >= 8) return 'zh';
  const words = text.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ]+/g) ?? [];
  const french = words.filter((word) =>
    /^(les|des|une|dans|pour|avec|sur|du|développement|équipe|gestion|expérience)$/.test(
      word,
    ),
  ).length;
  if (french >= 3) return 'fr';
  if (words.length >= 8) return 'en';
  return undefined;
}

/** Missing legacy metadata has a deterministic fallback, never the viewer's UI language. */
export function resolveDocumentLanguage(
  resume: LanguageDocument,
): DocumentLanguage {
  return (
    normalizeDocumentLanguage(resume.documentLanguage) ??
    detectDocumentLanguage(resume) ??
    'zh'
  );
}

const SECTION_TITLES: Record<DocumentLanguage, Record<string, string>> = {
  zh: {
    summary: '个人总结',
    experience: '工作经历',
    education: '教育经历',
    projects: '项目经历',
    skills: '专业技能',
    languages: '语言能力',
    certificates: '证书资质',
    profiles: '个人主页',
    awards: '奖项',
    contact: '联系方式',
  },
  en: {
    summary: 'Summary',
    experience: 'Work Experience',
    education: 'Education',
    projects: 'Projects',
    skills: 'Skills',
    languages: 'Languages',
    certificates: 'Certifications',
    profiles: 'Links',
    awards: 'Awards',
    contact: 'Contact',
  },
  ja: {
    summary: '自己紹介',
    experience: '職務経歴',
    education: '学歴',
    projects: 'プロジェクト',
    skills: 'スキル',
    languages: '語学力',
    certificates: '資格',
    profiles: 'リンク',
    awards: '受賞歴',
    contact: '連絡先',
  },
  ko: {
    summary: '자기소개',
    experience: '경력',
    education: '학력',
    projects: '프로젝트',
    skills: '보유 기술',
    languages: '외국어',
    certificates: '자격증',
    profiles: '링크',
    awards: '수상 경력',
    contact: '연락처',
  },
  fr: {
    summary: 'Profil',
    experience: 'Expérience professionnelle',
    education: 'Formation',
    projects: 'Projets',
    skills: 'Compétences',
    languages: 'Langues',
    certificates: 'Certifications',
    profiles: 'Liens',
    awards: 'Distinctions',
    contact: 'Coordonnées',
  },
};

export function documentSectionTitle(
  key: string,
  language: DocumentLanguage,
): string | undefined {
  return SECTION_TITLES[language][key];
}

/** Historic labels were either i18n keys or default headings, not user overrides. */
export function isDefaultSectionLabel(key: string, label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    !normalized ||
    normalized === key.toLowerCase() ||
    normalized === `sections.${key}` ||
    Object.values(SECTION_TITLES).some(
      (titles) => titles[key]?.toLowerCase() === normalized,
    ) ||
    (key === 'experience' &&
      ['experience', 'professional experience', '工作经验', '工作'].includes(
        normalized,
      )) ||
    (key === 'education' &&
      ['教育', '教育背景', '教育经历', '教育学历'].includes(normalized)) ||
    (key === 'skills' &&
      ['technical skills', '技能', '技术技能'].includes(normalized)) ||
    (key === 'certificates' && ['certificates', '证书'].includes(normalized)) ||
    (key === 'profiles' && normalized === 'profiles')
  );
}

const DOCUMENT_LABELS = {
  zh: {
    phone: '电话',
    email: '邮箱',
    address: '地址',
    website: '网站',
    yourName: '你的名字',
    avatar: '头像',
  },
  en: {
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    website: 'Website',
    yourName: 'Your Name',
    avatar: 'Photo',
  },
  ja: {
    phone: '電話',
    email: 'メール',
    address: '住所',
    website: 'ウェブサイト',
    yourName: '氏名',
    avatar: '写真',
  },
  ko: {
    phone: '전화',
    email: '이메일',
    address: '주소',
    website: '웹사이트',
    yourName: '이름',
    avatar: '사진',
  },
  fr: {
    phone: 'Téléphone',
    email: 'E-mail',
    address: 'Adresse',
    website: 'Site web',
    yourName: 'Votre nom',
    avatar: 'Photo',
  },
};

export function documentLabel(
  key: keyof typeof DOCUMENT_LABELS.en,
  locale?: string,
): string {
  return DOCUMENT_LABELS[normalizeDocumentLanguage(locale) ?? 'zh'][key];
}
