import type { TemplateDocument, TemplateNode, TextNode } from '../ast';

/** Shared by the header and each independently reorderable section. */
const styles: TemplateDocument['styles'] = {
  body: {
    color: 'var(--color-text)', fontSize: 'var(--font-size-sm)',
    lineHeight: 'var(--line-height)', letterSpacing: 'var(--letter-spacing)',
  },
  row: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 'var(--spacing-sm)' },
  entry: { gap: 'var(--spacing-xs)' },
  title: { color: 'var(--color-secondary)', fontSize: 'var(--font-size-md)', fontWeight: 700, textDecoration: 'none' },
  muted: { color: 'var(--color-text-secondary)' },
  contactText: {
    color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: 'var(--font-size-sm)',
    lineHeight: 1, flexShrink: 1, minWidth: 0, maxWidth: '100%',
  },
  contactValue: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  accent: { color: 'var(--color-primary)' },
  date: { color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', flexShrink: 0 },
  contact: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 3, paddingBottom: 3,
    flexShrink: 1, minWidth: 0, width: '100%',
  },
  heading: {
    paddingBottom: 5, borderBottomWidth: 'var(--title-divider-width)',
    borderStyle: 'solid', borderColor: 'var(--color-primary)',
  },
  headingText: { color: 'var(--color-primary)', fontSize: 'var(--font-size-lg)', fontWeight: 700, lineHeight: 1.4 },
};

const text = (id: string, read: string | string[], style?: TextNode['style']): TextNode => ({
  id, type: 'Text', value: { read }, ...(style ? { style } : {}),
});

const customFields = (id: string, path: string): TemplateNode => ({
  id, type: 'Box', each: { path, as: 'field' },
  when: { or: [{ exists: 'field.name' }, { exists: 'field.value' }] },
  style: ['contact', 'muted'],
  children: [
    { id: `${id}-icon`, type: 'Icon', name: { read: 'field.icon' }, size: 15, when: { exists: 'field.icon' }, style: ['muted'] },
    { id: `${id}-label`, type: 'Box', when: { exists: 'field.name' }, style: ['contactValue', { flexBasis: 'auto', flexGrow: 0, maxWidth: '40%' }], children: [
      { id: `${id}-name`, type: 'Text', value: '{{field.name}}：', style: ['contactText'] },
    ] },
    // Nested custom fields are displayed read-only: section edits target the parent item.
    { id: `${id}-content`, type: 'Box', style: ['contactValue'], children: [
      { id: `${id}-value`, type: 'Text', value: '{{field.value}}', href: { read: 'field.value' }, style: ['contactText'] },
    ] },
  ],
});

const contact = (id: string, path: string, icon: string, linked = false): TemplateNode => ({
  id, type: 'Box', when: { exists: path }, style: ['contact'],
  children: [
    { id: `${id}-icon`, type: 'Icon', name: icon, size: 16, style: ['muted'] },
    // Constrain the box around links too: the DOM backend wraps linked Text in an anchor.
    { id: `${id}-content`, type: 'Box', style: ['contactValue'], children: [
      { ...text(`${id}-value`, path, ['contactText']), ...(linked ? { href: { read: path } } : {}) },
    ] },
  ],
});

export function blueLineHeaderPreset(): TemplateDocument {
  return {
    version: 1, styles,
    root: {
      id: 'blue-line-header', type: 'Box', style: ['body', { gap: 'var(--spacing-xl)' }],
      children: [
        { id: 'blue-line-role', type: 'Text', role: 'title', value: { read: ['info.headline', 'info.fullName'] },
          style: [{ color: 'var(--color-secondary)', fontSize: 'var(--font-size-xxl)', fontWeight: 700, lineHeight: 1.25, letterSpacing: 0.5 }] },
        { id: 'blue-line-contact-grid', type: 'Box',
          style: [{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)' }],
          children: [
            { id: 'blue-line-contact-left', type: 'Box', style: [{ flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 }], children: [
              text('blue-line-name', 'info.fullName'),
              contact('blue-line-phone', 'info.phoneNumber', 'phone'),
              contact('blue-line-email', 'info.email', 'mail'),
              contact('blue-line-address', 'info.address', 'location'),
            ] },
            { id: 'blue-line-contact-right', type: 'Box', style: [{ alignItems: 'flex-end', flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 }], children: [
              contact('blue-line-website', 'info.website', 'globe', true),
              customFields('blue-line-custom-contact', 'info.customFields'),
            ] },
          ],
        },
      ],
    },
  };
}

export type BlueLineSectionKey = 'education' | 'skills' | 'experience' | 'projects' | 'openSource' | 'summary' | 'personalEvaluation' | 'profiles' | 'languages' | 'awards' | 'certificates';

const separatedRow = (id: string, children: TemplateNode[], style: TemplateNode['style'] = ['row']): TemplateNode => ({
  id, type: 'Box', style,
  separator: { id: `${id}-separator`, type: 'Text', value: '·', style: ['muted'] },
  children,
});

const entryContent = (key: BlueLineSectionKey, p: string): TemplateNode[] => {
  switch (key) {
    case 'education': return [{
      id: `${p}-details`, type: 'Box', style: ['row'], children: [
        text(`${p}-school`, ['school', 'institution', 'name']),
        text(`${p}-degree`, 'degree', ['accent']), text(`${p}-major`, 'major'),
        text(`${p}-date`, 'date', ['date']), text(`${p}-gpa`, 'gpa'), text(`${p}-location`, 'location', ['muted']),
      ],
    }];
    case 'experience': return [
      { id: `${p}-title-row`, type: 'Box', style: ['row', { justifyContent: 'space-between' }], children: [
        separatedRow(`${p}-title`, [
          { ...text(`${p}-company`, ['company', 'name']), href: { read: ['website', 'url', 'link'] } },
          text(`${p}-position`, ['position', 'role']),
        ], ['row', 'title', { flexGrow: 1, flexShrink: 1 }]),
        text(`${p}-date`, 'date', ['date']),
      ] },
      text(`${p}-location`, 'location', ['muted']),
    ];
    case 'openSource':
    case 'projects': return [
      { id: `${p}-title-row`, type: 'Box', style: ['row', { justifyContent: 'space-between' }], children: [
        separatedRow(`${p}-title`, [
          { ...text(`${p}-name`, 'name', ['title']), href: { read: ['link', 'url', 'website'] } },
          text(`${p}-role`, 'role', [{ fontSize: 'var(--font-size-xs)' }]),
        ], ['row', { flexGrow: 1, flexShrink: 1 }]),
        text(`${p}-date`, 'date', ['date']),
      ] },
      text(`${p}-technologies`, ['technologies', 'technology', 'techStack', 'tech'], ['muted']),
    ];
    case 'skills': return [separatedRow(`${p}-details`, [
      text(`${p}-name`, ['name', 'skill'], [{ fontWeight: 700 }]), text(`${p}-level`, 'level', ['muted']),
    ])];
    case 'languages': return [separatedRow(`${p}-details`, [
      text(`${p}-name`, ['name', 'language'], [{ fontWeight: 700 }]), text(`${p}-level`, ['level', 'fluency', 'proficiency'], ['muted']),
    ])];
    case 'profiles': return [separatedRow(`${p}-details`, [
      { ...text(`${p}-name`, ['platform', 'name'], [{ fontWeight: 700 }]), href: { read: ['url', 'link', 'website'] } },
      text(`${p}-username`, 'username', ['muted']),
      text(`${p}-date`, 'date', ['date']),
    ])];
    case 'awards':
    case 'certificates': return [{ id: `${p}-details`, type: 'Box', style: ['row', { justifyContent: 'space-between' }], children: [
      separatedRow(`${p}-name-issuer`, [
        { ...text(`${p}-name`, key === 'awards' ? ['name', 'title'] : ['name', 'certificate'], [{ fontWeight: 700 }]), href: { read: ['url', 'link'] } },
        text(`${p}-issuer`, 'issuer', ['muted']), text(`${p}-level`, 'level', ['muted']),
      ], ['row', { flexGrow: 1, flexShrink: 1 }]),
      text(`${p}-date`, 'date', ['date']),
    ] }];
    case 'personalEvaluation':
    case 'summary': return [];
  }
};

/** A per-section tree keeps renderer ordering, visibility and section controls active. */
export function blueLineSectionPreset(key: BlueLineSectionKey, title: string): TemplateDocument {
  const p = `blue-line-${key}`;
  return {
    version: 1, styles,
    root: {
      id: `${p}-section`, type: 'Box', section: { sectionKey: key, title, insertSlot: true },
      style: ['body', { gap: 'var(--spacing-sm)' }],
      children: [
        { id: `${p}-heading`, type: 'Box', section: { sectionKey: key, title, handle: true }, style: ['heading'],
          children: [{ id: `${p}-heading-text`, type: 'Text', role: 'sectionHeading', value: title, style: ['headingText'] }] },
        { id: `${p}-items`, type: 'Box', style: [{ gap: 'var(--spacing-md)' }], children: [
          { id: `${p}-item`, type: 'Box', each: { path: `sections.${key}` }, style: ['entry'], children: [
            ...entryContent(key, p),
            customFields(`${p}-custom`, 'customFields'),
            { id: `${p}-summary`, type: 'RichText', value: { read: ['summary', 'description'] }, style: ['body'] },
          ] },
        ] },
      ],
    },
  };
}
