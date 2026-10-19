/**
 * Verified people only. url is the person's own website; structured-data url
 * points to the localized biography page. See CONTENT.md before adding anyone.
 * @typedef {{ slug: string, name: string, bio: string, url: string, sameAs: string[] }} Author
 */
/** @type {Author[]} */
export const authors = [];

/** @param {string | undefined} slug */
export function getAuthor(slug) {
  return authors.find((author) => author.slug === slug);
}

/** @param {string} locale @param {string} slug */
export function authorHref(locale, slug) {
  return `/${locale}/about/authors/${slug}`;
}

/** @param {Author | undefined} author @param {string} locale @param {string | URL} site */
export function articleAuthorSchema(author, locale, site) {
  return author ? {
    '@type': 'Person',
    name: author.name,
    url: new URL(authorHref(locale, author.slug), site).href,
    sameAs: author.sameAs,
  } : {
    // Same @id as the page's Organization node, so the name must match it too:
    // one @id carrying two names reads as two conflicting entities.
    '@type': 'Organization',
    '@id': 'https://www.magic-resume.cn/#organization',
    name: 'Magic Resume',
  };
}
