/**
 * The one definition of what the product is (docs/specs/geo/spec.md §3), under
 * its new name 知遇 / Kenmet. Until the rename is retired the definition carries
 * the old name in brackets, so searches for it still land here.
 *
 * Answer engines build an entity by cross-checking how a product describes
 * itself across surfaces; five different self-descriptions is how we lost that
 * once already. So the text lives here, landing reads it, and
 * scripts/check-entity.mjs fails `pnpm lint` unless the surfaces that state it
 * carry it word for word. Change it here, then fix what the check reports —
 * never the other way round.
 *
 * Kept free of imports and TS-only syntax beyond `as const`: the check script
 * loads this file directly with Node's type stripping.
 */
export const ENTITY = {
  en: {
    /** meta / og description. */
    short:
      'Kenmet (formerly Magic Resume) is an open-source AI job-search workbench: the AI proposes resume edits in place and you accept or skip each one. MIT-licensed core, 20 templates, six modes, cloud sync.',
    /** README lead: the short form with the six modes spelled out. */
    long:
      'Kenmet (formerly Magic Resume) is an open-source AI job-search workbench: the AI proposes resume edits in place and you accept or skip each one. MIT-licensed core, 20 templates, six modes (create, optimize, analyze, translate, interview, export), cloud sync.',
    /** The landing FAQ (and so FAQPage and llms.txt) carries it word for word. */
    disambiguation:
      'Kenmet (formerly Magic Resume, magic-resume.cn) and the Magic Resume at magicv.art (魔方简历) are two independent projects maintained by different teams.',
  },
  zh: {
    short:
      '知遇（原名 Magic Resume）是开源的 AI 求职工作台：AI 就地提出简历修改建议，你逐条决定采纳或跳过。MIT 协议内核，20 套模板，六种工作模式，多设备云同步。',
    long:
      '知遇（原名 Magic Resume）是开源的 AI 求职工作台：AI 就地提出简历修改建议，你逐条决定采纳或跳过。MIT 协议内核，20 套模板，六种工作模式（创建、优化、分析、翻译、面试、导出），多设备云同步。',
    disambiguation:
      '知遇 Kenmet（原名 Magic Resume，magic-resume.cn）与 magicv.art 的 Magic Resume（魔方简历）是两个由不同团队维护的独立项目。',
  },
} as const;

/**
 * The definition under the old name. Only the landing has been renamed so far:
 * README, web metadata, the docs site and GitHub About still carry this word
 * for word, and check-entity holds them to it. Delete it once they move to ENTITY.
 */
export const LEGACY_ENTITY = {
  en: {
    short:
      'Magic Resume is an open-source AI resume workbench: the AI proposes edits in place and you accept or skip each one. MIT-licensed core, 20 templates, six modes, cloud sync.',
    long:
      'Magic Resume is an open-source AI resume workbench: the AI proposes edits in place and you accept or skip each one. MIT-licensed core, 20 templates, six modes (create, optimize, analyze, translate, interview, export), cloud sync.',
    disambiguation:
      'Magic Resume (magic-resume.cn) and the Magic Resume at magicv.art (魔方简历) are two independent open-source projects maintained by different teams.',
  },
  zh: {
    short:
      'Magic Resume 是开源的 AI 简历工作台：AI 就地提出修改建议，你逐条决定采纳或跳过。MIT 协议内核，20 套模板，六种工作模式，多设备云同步。',
    long:
      'Magic Resume 是开源的 AI 简历工作台：AI 就地提出修改建议，你逐条决定采纳或跳过。MIT 协议内核，20 套模板，六种工作模式（创建、优化、分析、翻译、面试、导出），多设备云同步。',
    disambiguation:
      'Magic Resume（magic-resume.cn）与 magicv.art 的 Magic Resume（魔方简历）是两个由不同团队维护的独立开源项目。',
  },
} as const;

/** How the brand is written. */
export const BRAND = {
  /** The fixed wordmark, in every locale. */
  wordmark: '知遇 Kenmet',
  /** JSON-LD `name` of every node under a shared @id: one @id carrying two names reads as two entities. */
  name: '知遇',
  alternateName: ['Kenmet', 'Magic Resume'],
  /** Page-title suffix. Chinese pairs both names: 知遇 alone collides with same-name recruiters. */
  title: { zh: '知遇 Kenmet', en: 'Kenmet' },
} as const;
