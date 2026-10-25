/**
 * The one definition of what Magic Resume is (docs/specs/geo/spec.md §3).
 *
 * Answer engines build an entity by cross-checking how a product describes
 * itself across surfaces; five different self-descriptions is how we lost that
 * once already. So the text lives here, landing reads it, and
 * scripts/check-entity.mjs fails `pnpm lint` unless README, web metadata and
 * the docs site carry it word for word. Change it here, then fix what the
 * check reports — never the other way round.
 *
 * Kept free of imports and TS-only syntax beyond `as const`: the check script
 * loads this file directly with Node's type stripping.
 */
export const ENTITY = {
  en: {
    /** meta / og description, docs.json, docs home. */
    short:
      'Magic Resume is an open-source AI resume workbench: the AI proposes edits in place and you accept or skip each one. MIT-licensed core, 20 templates, six modes, cloud sync.',
    /** README lead: the short form with the six modes spelled out. */
    long:
      'Magic Resume is an open-source AI resume workbench: the AI proposes edits in place and you accept or skip each one. MIT-licensed core, 20 templates, six modes (create, optimize, analyze, translate, interview, export), cloud sync.',
    /**
     * The landing FAQ (and so FAQPage and llms.txt), both READMEs and the docs
     * home carry it word for word. Shipped only after the GEO platform had three
     * baseline measurements, so its effect on entity accuracy can be measured.
     */
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
