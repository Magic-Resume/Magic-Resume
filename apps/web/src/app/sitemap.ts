import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  // The app is globally noindex; exposing a sitemap would invite crawlers to
  // treat the authenticated shell as the canonical marketing page. Keep this
  // route valid for tooling, but return no URLs until a genuinely public app
  // surface is deliberately added.
  const staticPages: MetadataRoute.Sitemap = []

  return staticPages
}
