import Script from 'next/script'

// 定义结构化数据的类型
interface ArticleData {
  title?: string;
  description?: string;
  image?: string;
  publishDate?: string;
  modifyDate?: string;
  url?: string;
}

interface StructuredDataProps {
  type: 'website' | 'article' | 'product' | 'organization' | 'faq' | 'howto'
  data?: ArticleData
}

/*
 * Rules for everything in this file — see docs/specs/geo/spec.md.
 *
 * 1. Every claim here must be verifiable from the repo or the product. Answer
 *    engines cross-check structured data against the rest of the web; a claim
 *    that fails that check doesn't just get ignored, it lowers the trust weight
 *    of the whole source. For an MIT-licensed project anyone can open the repo
 *    and count, so the cost of being caught is effectively zero.
 * 2. No aggregateRating until a real review corpus exists — inventing one
 *    violates Google's structured data policy.
 * 3. No prices. Plan pricing lives in the database under admin control, so any
 *    number here would drift; and there is a paid Pro tier, so "0" is false.
 * 4. Only reference URLs and assets that actually exist.
 *
 * The product description is the canonical one-liner shared with the landing
 * i18n, metaConfig and the READMEs. Change it in all of them or none.
 */
const DESCRIPTION =
  'Magic Resume 是开源的 AI 简历工作台：AI 就地提出修改建议，你逐条决定采纳或跳过。MIT 协议内核，19 套模板，六种工作模式，多设备云同步。'

/** The one verified public presence. Do not add unconfirmed handles. */
const GITHUB_REPO = 'https://github.com/Magic-Resume/Magic-Resume'

export default function StructuredData({ type, data = {} }: StructuredDataProps) {
  const getSchemaData = () => {
    // The brand's home is the landing site at the apex; this app lives on the
    // app subdomain. Assets referenced below must exist in apps/landing/public.
    const baseUrl = 'https://magic-resume.cn'

    switch (type) {
      case 'website':
        return {
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "Magic Resume",
          "alternateName": "魔法简历",
          "url": baseUrl,
          "description": DESCRIPTION,
          // No SearchAction: there is no /search route to point it at.
          "sameAs": [GITHUB_REPO]
        }

      case 'organization':
        return {
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Magic Resume",
          "alternateName": "魔法简历",
          "url": baseUrl,
          "logo": `${baseUrl}/magic-resume-mark.png`,
          "description": DESCRIPTION,
          "foundingDate": "2025", // first commit 2025-06-05
          // No contactPoint: the previous support@magic-resume.cn address has no
          // corroboration anywhere in the repo. Add it back once confirmed.
          "sameAs": [GITHUB_REPO],
          "knowsAbout": [
            "简历制作", "AI简历优化", "求职指导", "职业规划",
            "简历模板", "Resume Writing", "Career Coaching"
          ]
        }

      case 'product':
        return {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "Magic Resume",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "description": DESCRIPTION,
          "url": baseUrl,
          "screenshot": `${baseUrl}/magic-resume-og.jpg`,
          "datePublished": "2025-06-05",
          "license": "https://opensource.org/licenses/MIT",
          "author": {
            "@type": "Organization",
            "name": "Magic Resume"
          },
          "sameAs": [GITHUB_REPO],
          // Every entry below is checkable: 19 template ids in
          // packages/resume-schema, six modes in the landing copy, MIT LICENSE.
          "featureList": [
            "AI 就地提出修改建议，逐条采纳或跳过",
            "19 套简历模板",
            "六种工作模式：创建、优化、分析、翻译、面试、导出",
            "ATS 友好的 PDF 导出与 JSON 备份",
            "多设备云同步与版本历史",
            "MIT 协议开源内核，支持自部署"
          ],
          "keywords": "AI简历制作,开源简历工具,智能简历生成器,在线简历编辑,简历优化工具"
        }

      case 'faq':
        return {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Magic Resume 是免费的吗？",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "开源版永久免费，可自部署；云端版内置同步与 AI 能力，提供免费额度，重度使用可升级付费计划。"
              }
            },
            {
              "@type": "Question",
              "name": "AI 会不经允许修改我的简历吗？",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "不会。所有修改都以提案形式出现——红色删除、绿色新增、附带理由——你点下采纳才会生效。"
              }
            },
            {
              "@type": "Question",
              "name": "简历数据是否安全？",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "云端同步全程加密传输与存储，数据只属于你，随时可以完整导出。需要完全离线时，可自部署开源版。"
              }
            },
            {
              "@type": "Question",
              "name": "支持哪些导出格式？",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "一键导出 ATS 友好的 PDF；JSON 自由进出，便于备份与迁移。"
              }
            }
          ]
        }

      case 'howto':
        return {
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": "如何使用 Magic Resume 制作简历",
          "description": "从空白页到可投递的 PDF，四个步骤。",
          // No step images: the previous /step*.png and /howto-guide.png were
          // referenced but never existed in any public directory.
          "step": [
            {
              "@type": "HowToStep",
              "name": "选择模板",
              "text": "从 19 套模板中选择适合目标岗位的版式。"
            },
            {
              "@type": "HowToStep",
              "name": "填写信息",
              "text": "填写个人信息、工作经验、教育背景等基本内容。"
            },
            {
              "@type": "HowToStep",
              "name": "AI 优化",
              "text": "AI 就地提出修改建议并附上理由，你逐条决定采纳或跳过。"
            },
            {
              "@type": "HowToStep",
              "name": "导出简历",
              "text": "导出 ATS 友好的 PDF，或用 JSON 备份与迁移。"
            }
          ]
        }

      case 'article':
        return {
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": data.title || "Magic Resume 使用指南",
          "description": data.description || "简历制作指南与技巧分享。",
          // Falls back to the share card rather than /article-default.png, which
          // does not exist.
          "image": data.image || `${baseUrl}/magic-resume-og.jpg`,
          "author": {
            "@type": "Organization",
            "name": "Magic Resume"
          },
          "publisher": {
            "@type": "Organization",
            "name": "Magic Resume",
            "logo": {
              "@type": "ImageObject",
              "url": `${baseUrl}/magic-resume-mark.png`
            }
          },
          "datePublished": data.publishDate || new Date().toISOString(),
          "dateModified": data.modifyDate || new Date().toISOString(),
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": data.url || baseUrl
          }
        }

      default:
        return null
    }
  }

  const schemaData = getSchemaData()
  
  if (!schemaData) return null

  return (
    <Script
      id={`structured-data-${type}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        // Escape characters that could break out of the <script> block if user
        // data ever reaches the JSON-LD (e.g. a title containing "</script>").
        __html: JSON.stringify(schemaData).replace(
          /[<>\u2028\u2029]/g,
          (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
        ),
      }}
    />
  )
} 