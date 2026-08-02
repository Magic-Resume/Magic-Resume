import { isCloudMode } from '@/lib/config/app'
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

  // 三份法务文档：给人看，也给支付渠道审核与备案检查看，必须能被搜索引擎发现。
  // 首页在闸门关闭时会把访客弹去 /coming-soon，而 /legal/* 不受此影响。
  //
  // 只在云端模式列出。自建版这些路由是 404（部署者才是自己实例的数据控制者），
  // 向搜索引擎宣告三个 404 只会浪费抓取预算并留下坏记录。
  //
  // 英文版故意不在这里：它的正文尚未写就，`LegalDocument` 对没有内容的语言返回
  // 404。等英文落地时再连同 hreflang 一起加进来。
  const legalPages = isCloudMode
    ? ['terms', 'privacy', 'refund'].map((slug) => ({
        url: `${baseUrl}/legal/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.3,
      }))
    : []

  return [...staticPages, ...legalPages]
} 