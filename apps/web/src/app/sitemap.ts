import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://magic-resume.cn'
  
  // 静态页面 - 只包含实际存在的页面
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
    // 以下页面需要根据实际开发情况添加
    // {
    //   url: `${baseUrl}/templates`,
    //   lastModified: new Date(),
    //   changeFrequency: 'weekly' as const,
    //   priority: 0.9,
    // },
    // {
    //   url: `${baseUrl}/ai-analysis`,
    //   lastModified: new Date(),
    //   changeFrequency: 'weekly' as const,
    //   priority: 0.8,
    // },
    // {
    //   url: `${baseUrl}/guide`,
    //   lastModified: new Date(),
    //   changeFrequency: 'monthly' as const,
    //   priority: 0.7,
    // },
    // {
    //   url: `${baseUrl}/about`,
    //   lastModified: new Date(),
    //   changeFrequency: 'monthly' as const,
    //   priority: 0.5,
    // },
    // {
    //   url: `${baseUrl}/privacy`,
    //   lastModified: new Date(),
    //   changeFrequency: 'monthly' as const,
    //   priority: 0.3,
    // },
    // {
    //   url: `${baseUrl}/terms`,
    //   lastModified: new Date(),
    //   changeFrequency: 'monthly' as const,
    //   priority: 0.3,
    // }
  ]

  // 信任四件套里的三份文档：它们是给人看的，也是给支付渠道审核与备案检查看的，
  // 必须能被搜索引擎发现。首页在闸门关闭时会把访客弹去 /coming-soon，
  // 而 /legal/* 不受此影响。
  const legalPages = ['terms', 'privacy', 'refund'].map((slug) => ({
    url: `${baseUrl}/legal/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.3,
  }))

  return [...staticPages, ...legalPages]
} 