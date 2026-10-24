import { MetadataRoute } from 'next'
import { runtimePublicUrl } from '@/lib/config/runtime-public-url'

export const dynamic = 'force-dynamic'

// robots.txt 的分组语义：一个爬虫只服从**最具体**的那一组，且那一组会**完全替换**
// `*` 组 —— 不是叠加。所以任何具名 UA 组都必须自带完整的 disallow，
// 否则给 Googlebot 单独调 crawlDelay 的那一行会顺手把 `*` 组的所有限制全部撤销
// （此前 /dashboard*、/api/* 对 Googlebot 是完全放开的）。
const DISALLOW = [
  '/dashboard*',
  '/edit*',
  '/api/*',
  '/*?*', // 禁止带参数的URL
]

export default function robots(): MetadataRoute.Robots {
  const baseUrl = runtimePublicUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: DISALLOW,
        crawlDelay: 1,
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: DISALLOW,
        crawlDelay: 0,
      },
      {
        userAgent: 'Baiduspider',
        allow: '/',
        disallow: DISALLOW,
        crawlDelay: 1,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
