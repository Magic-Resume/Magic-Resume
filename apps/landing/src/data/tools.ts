import type { Locale } from '@/i18n/ui';

export interface ToolCopy {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  summary: string;
  bullets: string[];
  steps: string[];
  cta: string;
  ctaNote: string;
  demoTitle: string;
  demoButton: string;
  demoDone: string;
  demoItems: string[];
}

const zh: ToolCopy[] = [
  {
    slug: 'jd-matcher',
    title: 'AI 简历 JD 匹配工具',
    description: '把岗位描述拆成职责、能力和约束，再与真实简历证据逐条对照。',
    eyebrow: 'JD MATCHER',
    summary: '适合投递前的最后一轮核对：先看岗位需要什么，再决定哪些经历值得放到前面。演示使用合成数据，不会上传或保存你的简历。',
    bullets: ['识别岗位的关键职责与技能信号', '显示简历中已有证据与待补空白', '每条改写都附理由，确认后才会生效'],
    steps: ['粘贴目标岗位 JD', '检查匹配证据与缺口', '预览并采纳有事实依据的修改'],
    cta: '在工作台中匹配我的 JD',
    ctaNote: '开源内核 · 可先免费体验',
    demoTitle: '合成 JD 匹配演示',
    demoButton: '运行匹配',
    demoDone: '匹配完成：发现 3 个可验证信号',
    demoItems: ['React / TypeScript', '性能优化成果', '跨团队协作'],
  },
  {
    slug: 'resume-templates',
    title: 'ATS 友好的简历模板',
    description: '从清晰的文本结构开始，再用版式表达重点；模板不会替你编造经历。',
    eyebrow: 'TEMPLATES',
    summary: 'Magic Resume 提供 19 套可编辑模板。选择模板时先看岗位和文本顺序，再调整颜色与密度；导出前复制 PDF 文本检查 ATS 是否能读懂。',
    bullets: ['单栏、双栏与衬线等不同版式', '标题、日期和联系方式保持可解析', '浏览器编辑与 PDF 导出使用同一份数据'],
    steps: ['选择与岗位匹配的版式', '填入并核对真实经历', '复制导出文本，确认顺序和链接'],
    cta: '打开模板选择器',
    ctaNote: '19 套模板 · MIT 协议开源内核',
    demoTitle: '模板预览（合成简历）',
    demoButton: '切换预览',
    demoDone: '已切换：文本结构保持不变',
    demoItems: ['Classic · 学术与正式岗位', 'Azurill · 信息密度较高', 'Bronzor · 极简单栏'],
  },
  {
    slug: 'mcp-resume-editor',
    title: '用 Claude Code 编辑简历：Resume MCP',
    description: '通过 MCP 让 Claude Code、Cursor 或 Windsurf 读取并安全编辑 Magic Resume。',
    eyebrow: 'RESUME MCP',
    summary: 'Resume MCP 是连接层，不是第二个数据库。它用 schema-aware、patch-based 操作限制写入范围，并在应用前展示预览。',
    bullets: ['列出并读取已授权的简历', '先预览 patch，再决定是否写入', '网页编辑器继续负责审阅与导出'],
    steps: ['安装 @magic-resume/mcp', '创建最小权限的个人访问令牌', '在 AI 工具中要求先预览再应用'],
    cta: '查看 MCP 设置指南',
    ctaNote: '适用于兼容 MCP 的 AI 工具',
    demoTitle: 'Patch preview（合成数据）',
    demoButton: '显示 patch',
    demoDone: '预览已生成：尚未写入任何数据',
    demoItems: ['experience[0].summary', 'skills.items', 'basics.label'],
  },
];

const en: ToolCopy[] = [
  {
    slug: 'jd-matcher',
    title: 'AI resume job-description matcher',
    description: 'Break a job description into responsibilities, capabilities, and constraints, then compare each one with real resume evidence.',
    eyebrow: 'JD MATCHER',
    summary: 'Use it for the last review before applying: understand what the role needs, then decide which verified experience deserves the most space. The demo uses synthetic data and does not upload or save your resume.',
    bullets: ['Extract the role’s responsibilities and skill signals', 'Show existing evidence and uncovered requirements', 'Attach a reason to every edit and apply it only after review'],
    steps: ['Paste the target job description', 'Review evidence and gaps', 'Preview and accept only fact-based edits'],
    cta: 'Match my JD in the workbench',
    ctaNote: 'Open-source core · start free',
    demoTitle: 'Synthetic JD matching demo',
    demoButton: 'Run matching',
    demoDone: 'Match complete: 3 verifiable signals found',
    demoItems: ['React / TypeScript', 'Measured performance result', 'Cross-team collaboration'],
  },
  {
    slug: 'resume-templates',
    title: 'ATS-friendly resume templates',
    description: 'Start with a clear text structure, then use layout to show priorities. A template never invents your experience.',
    eyebrow: 'TEMPLATES',
    summary: 'Magic Resume ships 19 editable templates. Choose for the role and text order first, then tune color and density; copy the exported PDF text to verify that an ATS can parse it.',
    bullets: ['Single-column, two-column, and serif options', 'Headings, dates, and contact details stay parseable', 'Browser editing and PDF export use the same data'],
    steps: ['Choose a layout for the role', 'Enter and verify your real experience', 'Copy the exported text and check order and links'],
    cta: 'Open the template picker',
    ctaNote: '19 templates · MIT-licensed open-source core',
    demoTitle: 'Template preview (synthetic resume)',
    demoButton: 'Switch preview',
    demoDone: 'Switched: text structure stayed the same',
    demoItems: ['Classic · academic and formal roles', 'Azurill · denser information', 'Bronzor · minimal single column'],
  },
  {
    slug: 'mcp-resume-editor',
    title: 'Edit a resume with Claude Code: Resume MCP',
    description: 'Let Claude Code, Cursor, or Windsurf read and safely edit a Magic Resume through MCP.',
    eyebrow: 'RESUME MCP',
    summary: 'Resume MCP is a connection layer, not a second database. Schema-aware, patch-based operations limit the write surface and show a preview before anything is applied.',
    bullets: ['List and read resumes you have authorized', 'Preview a patch before writing', 'Keep review and PDF export in the web editor'],
    steps: ['Install @magic-resume/mcp', 'Create a least-privilege personal access token', 'Ask the AI tool to preview before applying'],
    cta: 'Read the MCP setup guide',
    ctaNote: 'Works with MCP-compatible AI tools',
    demoTitle: 'Patch preview (synthetic data)',
    demoButton: 'Show patch',
    demoDone: 'Preview generated: no data has been written',
    demoItems: ['experience[0].summary', 'skills.items', 'basics.label'],
  },
];

const byLocale = { zh, en } satisfies Record<Locale, ToolCopy[]>;

export function getTools(locale: Locale): ToolCopy[] {
  return byLocale[locale];
}

export function getTool(locale: Locale, slug: string): ToolCopy | undefined {
  return getTools(locale).find((tool) => tool.slug === slug);
}
