import type { MetadataRoute } from 'next'
import { siteBaseUrl } from '@/lib/siteUrl'

export default function robots(): MetadataRoute.Robots {
  const base = siteBaseUrl()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Both forms: the bare path and the subtree. A single '/admin' string is
      // matched as a prefix by most crawlers, but being explicit costs nothing
      // and removes the ambiguity.
      disallow: ['/admin', '/admin/'],
    },
    // Advertise the generated sitemap. Without this, /sitemap.xml exists but is
    // never announced, so crawlers only find pages by following links.
    // Omitted entirely rather than emitted relative when WEBSITE_URL is unset —
    // a relative sitemap directive is invalid and worse than none.
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  }
}
