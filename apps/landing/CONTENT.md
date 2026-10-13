# Build-time content (W4)

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

Templates derive IDs from `@magic-resume/resume-schema` and layout facts from
`@magic-resume/resume-templates/registry`. React renders the actual template at
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
