import type { Resume } from '@magic-resume/resume-schema';

/** Entirely fictional fixtures. These are never persisted to the resume store. */
export const blueLinePreviewResume: Resume = {
  name: '蓝线 · 虚构示例',
  template: 'blue-line',
  documentLanguage: 'zh',
  documentLanguageSource: 'explicit',
  themeColor: '#0879ee',
  typography: 'sans-serif',
  info: {
    fullName: '林知远',
    headline: '前端开发工程师',
    email: 'linzhiyuan@example.com',
    phoneNumber: '138-0000-0000',
    address: '杭州',
    website: 'https://example.com',
    avatar: '',
    customFields: [
      { id: 'contact-code', name: '代码主页', value: 'https://code.example.com/lin', icon: 'github' },
    ],
  },
  sections: {
    education: [
      {
        id: 'edu-1', visible: true, school: '云川大学', degree: '本科',
        major: '计算机科学与技术', date: '2020.09 — 2024.06',
        summary: '<ul><li>主修数据结构、计算机网络、数据库系统与软件工程，专业成绩前 10%。</li></ul>',
      },
    ],
    skills: [
      {
        id: 'skill-1', visible: true, name: '前端开发',
        summary: '<p>熟悉 <strong>JavaScript / TypeScript、React、Next.js</strong>，理解组件设计、状态管理与浏览器渲染机制。</p>',
      },
      {
        id: 'skill-2', visible: true, name: '工程与服务端',
        summary: '<p>掌握 <strong>Node.js、NestJS、PostgreSQL</strong>，使用 Vitest、Playwright 与 CI 持续验证交付质量。</p>',
      },
    ],
    experience: [
      {
        id: 'exp-1', visible: true, company: '星河科技', position: '前端开发工程师',
        date: '2024.07 — 至今', location: '杭州',
        summary: '<ul><li>负责业务工作台与共享组件建设，通过路由拆包和资源预加载，将核心页面首屏加载时间从 <strong>2.8s 降至 1.4s</strong>。</li><li>为复杂表单建立类型约束与自动化回归流程，统一错误提示、键盘操作和异步状态反馈。</li></ul>',
      },
    ],
    projects: [
      {
        id: 'project-1', visible: true, name: '云笺 · 协作知识库', role: '全栈开发',
        date: '2025.03 — 2025.08', link: 'https://example.com/projects/yunjian',
        summary: '<p><strong>技术栈：</strong>Next.js · TypeScript · NestJS · PostgreSQL</p><ul><li>设计文档目录、全文搜索与权限模型，基于乐观更新和请求去重提升编辑反馈速度。</li><li>通过游标分页与虚拟列表承载万条文档；为搜索、分享和访问权限补充端到端测试。</li></ul>',
      },
      {
        id: 'project-2', visible: true, name: '观澜 · 前端性能看板', role: '独立开发',
        date: '2024.10 — 2025.01', link: 'https://example.com/projects/guanlan',
        summary: '<p><strong>技术栈：</strong>React · Vite · Web Vitals · ECharts</p><ul><li>实现页面指标采集、聚合与趋势对比，支持按版本定位性能回退并回溯发布记录。</li></ul>',
      },
    ],
    openSource: [
      {
        id: 'oss-1', visible: true, name: '轻舟 UI', role: '社区贡献者',
        link: 'https://example.com/open-source/qingzhou',
        summary: '<ul><li>完善组合输入组件的键盘交互、中文文档与回归用例，参与问题复现和代码评审。</li></ul>',
      },
    ],
    personalEvaluation: [
      {
        id: 'evaluation-1', visible: true,
        summary: '<ul><li>重视可维护性与用户体验，习惯先澄清边界、再验证方案，能独立推进从需求到上线的完整交付。</li></ul>',
      },
    ],
  },
  sectionOrder: [
    { key: 'education', label: 'sections.education' },
    { key: 'skills', label: 'sections.skills' },
    { key: 'experience', label: 'sections.experience' },
    { key: 'projects', label: 'sections.projects' },
    { key: 'openSource', label: 'sections.openSource' },
    { key: 'personalEvaluation', label: 'sections.personalEvaluation' },
  ],
};

export const blueLineCompleteResume: Resume = {
  ...blueLinePreviewResume,
  name: '蓝线 · 完整分区示例',
  sections: {
    ...blueLinePreviewResume.sections,
    profiles: [
      { id: 'profile-1', visible: true, platform: '技术笔记', username: '林知远', url: 'https://notes.example.com', summary: '<p>记录工程实践与可访问性学习。</p>' },
    ],
    languages: [
      { id: 'language-1', visible: true, language: '中文', level: '母语' },
      { id: 'language-2', visible: true, language: '英语', level: '可阅读技术文档与书面协作' },
    ],
    certificates: [
      { id: 'certificate-1', visible: true, name: '云川软件工程实践证书', certificate: '云川软件工程实践证书', issuer: '云川技术学院', date: '2024.05', summary: '<p>课程结业证明（虚构示例）。</p>' },
    ],
    summary: [
      { id: 'summary-1', visible: true, summary: '<p>关注前端工程、协作产品与开发者体验，具备从界面实现到 API 设计的完整实践经验。</p>' },
    ],
    awards: [
      { id: 'award-1', visible: true, name: '云川校园软件设计赛 · 一等奖', date: '2023.11', summary: '<p>以团队协作工具项目获奖（虚构示例）。</p>' },
    ],
  },
  sectionOrder: [
    { key: 'summary', label: 'sections.summary' },
    ...blueLinePreviewResume.sectionOrder,
    { key: 'profiles', label: 'sections.profiles' },
    { key: 'languages', label: 'sections.languages' },
    { key: 'certificates', label: 'sections.certificates' },
    { key: 'awards', label: 'sections.awards' },
  ],
};

export const blueLineLongResume: Resume = {
  ...blueLineCompleteResume,
  name: '蓝线 · 长内容示例',
  sections: {
    ...blueLineCompleteResume.sections,
    experience: [
      ...blueLinePreviewResume.sections.experience,
      {
        id: 'exp-2', visible: true, company: '远山数字产品工作室', position: '前端开发实习生',
        date: '2023.07 — 2024.03', location: '远程',
        summary: '<ul><li>参与多租户数据分析平台建设，将查询参数、图表配置和访问权限整理为共享类型，减少跨团队联调中的字段歧义。</li><li>针对低速网络与移动端场景，补充空状态、重试入口、加载占位及键盘焦点管理，确保长内容和异常反馈仍可完整阅读。</li><li>建立组件交互示例与视觉回归基线，覆盖长标题、多行说明、混合语言与链接溢出等边界条件。</li></ul>',
      },
    ],
    projects: [
      ...blueLinePreviewResume.sections.projects,
      {
        id: 'project-long', visible: true,
        name: '远帆 · 面向多团队的实时协作与异步任务管理平台',
        role: '前端架构与服务端接口设计', date: '2025.09 — 2026.03',
        link: 'https://example.com/projects/yuanfan-collaboration-workspace',
        summary: '<p><strong>技术栈：</strong>React · TypeScript · WebSocket · Node.js · Redis · PostgreSQL</p><ul><li>围绕任务分派、评论订阅和协作通知建立统一事件模型，结合消息序号、断线重连与幂等消费处理弱网场景，验证重复消息不会造成界面状态错乱。</li><li>将复杂筛选条件序列化到 URL，支持跨设备分享查询视图；使用受控状态与缓存失效策略，让列表、详情和统计数据在编辑后保持一致。</li><li>为文件上传设计分片校验、暂停恢复与失败重试流程，使用 AbortController 取消过期请求，避免快速切换任务时显示上一条记录的响应。</li><li>记录关键设计取舍和性能测量方法，通过自动化场景验证长文本换行、多个内联链接、嵌套列表及中英文混排的可读性。参考文档：<a href="https://example.com/docs/collaboration/architecture-and-reliability">https://example.com/docs/collaboration/architecture-and-reliability</a>。</li></ul>',
      },
    ],
  },
};

export const blueLinePreviewVariants = {
  standard: { label: '标准示例', description: '六个分区，查看日常投递版式。', resume: blueLinePreviewResume },
  complete: { label: '完整分区', description: '补充简介、主页、语言、证书与奖项。', resume: blueLineCompleteResume },
  long: { label: '长内容', description: '增加经历与长段落，检查换行和长页表现。', resume: blueLineLongResume },
} as const;

export type BlueLinePreviewVariant = keyof typeof blueLinePreviewVariants;
