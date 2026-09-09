# Resume domain stores

The editor used to subscribe to the entire `useResumeStore` facade. The domain
stores in this directory expose narrower slices for new code while preserving
the facade as a compatibility boundary during migration:

- `document` owns resume data and document mutations.
- `persistence` owns local save/load lifecycle.
- `sync` owns cloud synchronization state.
- `versions` owns history operations.
- `sharing` owns public/share mutations.
- `editor-ui` owns editor-only panel and generation state.

`bridge.ts` mirrors the selected fields from the legacy store, so there is one
authoritative state and no dual-write race. New features should import the
narrowest store they need; once all consumers migrate, the bridge can be
replaced with independently persisted stores without changing page contracts.
