import { MetadataRoute } from 'next'

// robots.txt 的分组语义：一个爬虫只服从**最具体**的那一组，且那一组会**完全替换**
// `*` 组 —— 不是叠加。所以任何具名 UA 组都必须自带完整的 disallow，
// 否则给 Googlebot 单独调 crawlDelay 的那一行会顺手把 `*` 组的所有限制全部撤销
// （此前 /dashboard*、/api/* 对 Googlebot 是完全放开的）。
const DISALLOW = [
  '/dashboard*',
  '/edit*',
  '/api/*',
  '/sign-in*',
  '/sign-up*',
  '/*?*', // 禁止带参数的URL
]

// `/s/*`（分享出去的简历，页面里有真名 / 电话 / 邮箱）**故意不写进 disallow**：
// 被 robots.txt 挡住的页面爬虫根本抓不到，也就看不到页面里的 `noindex`，
// 反而可能被"仅 URL"收录且撤不下来。让它可抓、由 `s/[shareId]/page.tsx` 的
// `robots: { index: false, follow: false }` 明确要求除名，才是能真正生效的那条路。

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://magic-resume.cn'

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
