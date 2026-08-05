import { Metadata } from "next";

// 元信息配置
const metaConfig: { [key: string]: Metadata } = {
  'Landing': {
    title: {
      default: "Magic Resume - AI智能简历制作器 | 免费在线简历生成器",
      template: `%s | Magic Resume - AI智能简历制作`,
    },
    // 实体定义的唯一来源见 docs/specs/geo/spec.md §3。这句话在 landing i18n、
    // StructuredData、README 里必须逐字一致 —— 答案引擎靠交叉印证建立实体认知，
    // 说法不一致就建不起稳定实体。改这里请同步改其余几处。
    description: "Magic Resume 是开源的 AI 简历工作台：AI 就地提出修改建议，你逐条决定采纳或跳过。MIT 协议内核，19 套模板，六种工作模式，多设备云同步。",
    keywords: [
      "AI简历制作", "智能简历生成器", "开源简历工具", "在线简历编辑器",
      "简历模板", "简历优化", "AI简历", "程序员简历", "产品经理简历",
      "resume builder", "AI resume", "open source resume", "cv maker",
      "简历生成器", "求职简历", "简历设计", "简历下载", "简历导出"
    ],
    openGraph: {
      title: "Magic Resume - 开源 AI 简历工作台",
      description: "Magic Resume 是开源的 AI 简历工作台：AI 就地提出修改建议，你逐条决定采纳或跳过。MIT 协议内核，19 套模板，六种工作模式，多设备云同步。",
      siteName: "Magic Resume",
      locale: 'zh_CN',
      type: 'website',
      images: [
        {
          url: '/magic-resume-preview.png',
          width: 1200,
          height: 630,
          alt: 'Magic Resume - AI智能简历制作器'
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Magic Resume - 开源 AI 简历工作台',
      description: 'AI 就地提出修改建议，你逐条决定采纳或跳过。MIT 协议内核，19 套模板，多设备云同步。',
      images: ['/magic-resume-preview.png'],
      // creator: 未填 —— 原值 '@MagicResume' 未经核实。错误的 handle 会把权重
      // 导给别人，也是答案引擎交叉验证时的一个失败点。确认真实账号后再补。
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    // verification: 移除 —— 原先是 "your-google-verification-code" 占位符，
    // 被原样发布成 <meta name="google-site-verification"> 标签。拿到真实验证码
    // 再加回来；空着好过发一个假的。
    //
    // alternates: 移除 —— 原先把 canonical 硬编码成 https://magic-resume.cn。
    // 这份 metadata 被 spread 进根 layout，等于 web 的每一个页面都声明
    // "我的规范地址是 landing 站"，主动放弃自身索引。Astro 拆分后 apex 归
    // apps/landing，web 在 app.magic-resume.cn。不设 canonical 时搜索引擎按
    // 实际抓取地址处理，比设错好；要精确的话应由各页自行设置。
  },
  // 'Templates' 的草稿配置已删除：它写着「50+精美模板」，而实际是 19 套
  // （packages/resume-schema 的 templateIds）。注释掉的假数字迟早会被人取消
  // 注释直接发出去，删掉比留着安全。真要加这个页面时，数字从 templateIds
  // 取长度，不要手写。
  'Dashboard': {
    title: "我的简历 - 简历管理中心 | Magic Resume",
    description: "管理您的所有简历，查看简历数据分析，使用AI优化工具提升简历质量。",
    robots: {
      index: false,
      follow: false,
    },
  },
  'Edit': {
    title: "编辑简历 - 在线简历编辑器 | Magic Resume",
    description: "使用Magic Resume强大的在线编辑器，实时预览简历效果，AI智能优化内容。",
    robots: {
      index: false,
      follow: false,
    },
  },
};

export default metaConfig;
