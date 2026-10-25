# Build-time content (W3 / W4)

`build` runs `sync-content.mjs` explicitly before Astro and checks the generated
llms.txt and template pages afterwards. The landing Turbo build is uncached so a
Core deploy hook fetches fresh data even when source files have not changed.

Set `PUBLIC_CONTENT_API_URL` to Core's public API origin. Without it, the build
uses the checked-in article seeds and generates no knowledge pages. Articles
use `/api/content/articles` (`PUBLIC_CONTENT_API_PATH` can override it). Lists
use `{ items, total, current, size }`, optionally wrapped in `{ data: ... }`.
Requests are bounded to 100 pages and 12 seconds per request. Article pages
request up to 100 rows; knowledge pages request 50 (Core's public limit).

Articles are fully fetched and validated before a staged directory replaces
`src/content/articles/remote`. Empty, malformed, truncated, duplicate or failed
responses preserve the entire last-good corpus. Seeds are never removed.
After transport validation, articles that violate the source or author-slug
policy below are dropped with a warning. The remaining corpus is promoted even
when all rows are dropped, so rejected remote copies do not stay published.
The remote directory is an ignored build artifact; fresh checkouts fall back to
seeds if Core is unavailable. An API copy takes precedence over a matching seed.

Knowledge snapshots are refreshed on every build, including empty results and
failures, to avoid retaining withdrawn entries. Campus routes use published
`/api/knowledge/timelines` data, require HTTP(S) source URLs and a real `updatedAt`,
and only generate seasons with at least 30 distinct companies (W4 launch gate).
Each eligible season gets an index and company pages. Schema uses `ItemList`.
**Current Core gap:** `PublishedTimelineResponse` does not yet expose `updatedAt`.
Such rows are withheld rather than substituting the fetch time for an update date.

Guides request `/api/knowledge/exemplars` (overridable with
`PUBLIC_EXEMPLAR_API_PATH`, restricted to `/api/knowledge/`). This public Core
endpoint is not implemented yet. The expected paginated rows contain `id`,
`role`, `content`, `status: "active"` and an explicit `sourceResumeId: null` or
`""`. Optional fields: `locale` (`en` or `zh`, defaults to `zh` for the existing
Chinese corpus), `rationale`, `sourceNote`. Missing provenance fails closed.
Core must also enforce D7=a server-side; landing filters both route generation
and the example renderer, with a regression test for user-derived content.
No admin endpoint or token is used for knowledge requests.

Templates derive IDs from `@magic-resume-kit/resume-schema` and layout facts from
`@magic-resume-kit/resume-templates/registry`. React renders the actual template at
build time using synthetic data, with no client hydration. The shared rich-text
SSR fallback renders an allowlisted, attribute-free React tree. Suggested roles
are editorial recommendations, not ATS compatibility claims.

Verification (Node 22, pnpm 10):

```sh
corepack pnpm --filter @magic-resume/landing test
corepack pnpm --filter @magic-resume/landing lint
corepack pnpm turbo build --filter=@magic-resume/landing
npm run lint
```

## W3 structured data and crawler defaults

`loadPricing()` returns both plans and their provenance. `SoftwareApplication`
offers come only from a validated `LANDING_PRICING_URL` snapshot; static pricing
copy never generates offers. Monthly and yearly snapshots use `P1M` and `P1Y`
billing durations. `softwareVersion` comes from the first release heading in the
root `CHANGELOG.md`; unreadable or unparseable changelogs omit the property.

`DEFAULT_LOCALE` in `src/i18n/ui.ts` is `zh`. Astro's root fallback, hreflang and
sitemap `x-default` follow it. Vercel redirects leading Chinese and English
`Accept-Language` headers to `/zh` and `/en`, respectively; missing or other
languages fall back to `/zh`. Keep `vercel.json` aligned when changing the default.
`check-content.mjs` verifies the built redirect, robots group, hreflang and
sitemap. `check-llms.mjs` checks format without assuming a default language;
llms.txt deliberately lists both locales. IndexNow reads every sitemap `<loc>`
and `<lastmod>` without filtering by locale; its URLs need no default-locale edit.

## Authors and sources

`src/data/authors.mjs` intentionally ships an empty `authors` registry. Do not add
placeholder people. To add a verified author:

1. Add an entry with a unique lowercase hyphenated `slug`, real `name`, factual
   `bio`, their HTTP(S) personal `url`, and verified profile URLs in `sameAs`
   (an empty list is fine). The same biography is available in both locales.
2. Set `authorSlug: <that slug>` in article frontmatter or the Core payload.
   An `author` value matching a registered slug also resolves to that person;
   `authorSlug` is the explicit, validated form and takes precedence.
3. Build and inspect `/zh/about/authors/<slug>` and `/en/about/authors/<slug>`.
   Routes and sitemap entries exist only for registered authors. The article
   byline links there, and its JSON-LD emits `Person` with that localized URL.
   The registry's `url` is shown as the person's website, not used in place of
   the biography URL. Update the empty-registry test when adding the first person.

Without a registered author, JSON-LD keeps the editorial organization and
references `https://www.magic-resume.cn/#organization`; it never invents a Person.
Unknown explicit `authorSlug` values fail local collection validation and are
warned about and dropped during remote sync.

Articles published **or modified** after 2026-10-14 must contain at least one
`sources` entry (`title`, `url`). The cutoff includes all of October 14 in UTC;
2026-10-15T00:00:00Z starts enforcement. Use genuine external sources and review
against the [GEO content checklist](../../docs/specs/geo/spec.md#7-新内容评审清单w3).
Local violations fail schema validation; remote violations are warned about and
dropped without failing the build. Dates must describe actual publication and
revision, never build time.

Two grandfathered seeds currently have zero sources: `en/ats-resume-checklist.md`
and `zh/ats-resume-checklist.md`. Add sources when revising them after the cutoff.
The JD-matching and MCP guides in both locales already have one source each.
