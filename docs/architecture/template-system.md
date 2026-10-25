---
title: Magic Resume Template System
type: architecture
status: Living
owner: kaihuang
created: 2026-07-03
updated: 2026-07-03
summary: Template registry, preview assets, template authoring flow, and web integration boundaries.
scope: [packages/resume-templates, packages/resume-schema, apps/web]
repos: [Magic-Resume]
related: [architecture/schema]
---

# Magic Resume Template System

> Public packages moved to [magic-resume-kit](https://github.com/Magic-Resume/magic-resume-kit) on 2026-10-25. The `packages/resume-schema`, `packages/resume-templates`, `packages/design-system`, `packages/icons`, `packages/utils` and `packages/mcp` source paths and package build commands below refer to that repository. The editor consumes published `@magic-resume-kit/*` packages; its local workspaces are listed in the root README.

Magic Resume templates live in `packages/resume-templates`. The package keeps the current DSL rendering system, but the public template list is now derived from a single registry.

## Registry

`templateRegistry` is the canonical list of templates. Each manifest contains:

- `id`: stable template ID from `templateSchema`.
- `name`: display name.
- `description`: short template description.
- `tags`: searchable UI tags.
- `status`: template status from the DSL.
- `thumbnailUrl`: preview image URL.
- `template`: the full template DSL config.

Derived exports:

- `templateManifestList`
- `templateList`
- `templatesById`
- `defaultTemplate`
- `getTemplateById(id)`
- `getTemplateManifestById(id)`
- `getTemplateManifestList()`

## Preview Assets

Template thumbnails should use:

```text
apps/web/public/templates/jpg/{templateId}.jpg
```

Future PDF previews can follow:

```text
apps/web/public/templates/pdf/{templateId}.pdf
```

## Adding a Template

1. Add a new template config under `packages/resume-templates/src/config`.
2. Add the template ID to `packages/resume-schema/src/index.ts` `templateIds`.
3. Register the template in `packages/resume-templates/src/registry.ts`.
4. Add a preview image at `apps/web/public/templates/jpg/{templateId}.jpg`.
5. Run:

```bash
pnpm --filter @magic-resume-kit/resume-schema test
pnpm --filter @magic-resume-kit/resume-templates build
pnpm --filter @magic-resume-kit/resume-templates lint
```

6. Open the web template panel and confirm the name, tags, thumbnail, and switching behavior.

## Web Integration

`apps/web/src/app/api/templates/route.ts` keeps the legacy response shape:

- `templates`
- `defaultTemplate`
- `templateList`

It also exposes `manifests` so UI surfaces can prefer manifest metadata without maintaining a second list.

The template panel should use manifest fields for `thumbnailUrl`, `name`, `description`, `tags`, and `status`.
