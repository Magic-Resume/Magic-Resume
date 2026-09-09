/**
 * 分区的语义：中文标题，与「哪些分区是内建的」。
 *
 * ## 为什么必须两端共用一份
 *
 * 这两张表原来在屏幕渲染器与 PDF 渲染器里各存了一份，注释还写着「see the HTML
 * renderer's twin」——然后它们**静默漂移了**：PDF 那份把 `summary` / `awards` 当成内建，
 * 屏幕那份没有。而两边用同一个守卫（`内建 → 不合成`），于是 19 个模板里有 16 个
 * **在屏幕上显示个人总结、导出 PDF 却没有**。用户内容在导出时凭空消失，没有任何报错。
 *
 * 复制一份表是不需要理由的动作，所以它一定会再次发生——除非表只有一份。
 *
 * ## 为什么标题与「内建」要分成两样东西
 *
 * 原来它们挤在同一张表里：一个 key 在表里同时意味着「有中文标题」和「是内建分区」。
 * 但这两件事本来就不同——`summary` 需要中文标题，却**应该**在模板没声明它时被合成出来。
 * 挤在一起就没法表达这种组合，于是只能二选一，而两个渲染器各选了一边。
 */

/** 中文标题（按 section key）。**超集**——收录所有需要中文名的分区。 */
export const ZH_TITLE_BY_SECTION_KEY: Record<string, string> = {
  summary: '个人总结',
  experience: '工作经历',
  education: '教育经历',
  projects: '项目经历',
  skills: '专业技能',
  languages: '语言能力',
  certificates: '证书资质',
  profiles: '个人主页',
  awards: '奖项',
};

/** 中文标题（按英文标题猜）。两端并集：屏幕原有 header/profile/contact，PDF 原有 links。 */
export const ZH_TITLE_BY_ENGLISH: Record<string, string> = {
  header: '基本信息',
  summary: '个人总结',
  profile: '个人信息',
  contact: '联系方式',
  experience: '工作经历',
  'work experience': '工作经历',
  'professional experience': '专业经历',
  education: '教育经历',
  projects: '项目经历',
  skills: '专业技能',
  'technical skills': '技术技能',
  languages: '语言能力',
  certificates: '证书资质',
  certifications: '证书资质',
  profiles: '个人主页',
  links: '个人主页',
  awards: '奖项',
};

/**
 * 模板没声明时**不**替它合成分区的那些 key。
 *
 * 语义是「模板把它留空是有意的」——所以这里只放**每个模板都必然处理**的核心分区。
 * `summary` 与 `awards` 刻意**不在**这里：19 个模板里只有 3 个声明了 `sections.summary`，
 * 其余 16 个更像是漏了而不是有意省略，而**导出时丢用户内容是更糟的失败**。
 */
export const BUILT_IN_SECTION_KEYS: ReadonlySet<string> = new Set([
  'experience',
  'education',
  'projects',
  'skills',
  'languages',
  'certificates',
  'profiles',
]);

/** 这个分区在模板没声明时是否应当被跳过（而不是自动合成一个出来）。 */
export function isBuiltInSection(sectionKey: string): boolean {
  return BUILT_IN_SECTION_KEYS.has(sectionKey);
}

/** 解析中文标题：先按 key，再按英文标题猜，都没有就用原标题。 */
export function zhTitleForSection(
  sectionKey: string | undefined,
  title: string,
): string {
  const byKey = sectionKey ? ZH_TITLE_BY_SECTION_KEY[sectionKey] : undefined;
  return byKey ?? ZH_TITLE_BY_ENGLISH[title.trim().toLowerCase()] ?? title;
}
