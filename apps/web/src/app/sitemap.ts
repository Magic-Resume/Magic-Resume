import { isCloudMode } from '@/lib/config/app'
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://magic-resume.cn'
  
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
  ]

  // 仅云端模式：自建版 /legal/* 是 404，英文版正文未写也是 404，都不该进 sitemap。
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