# GenUI components

This directory contains the production Agent UI components exported by
`@magic-resume/genui`.

## Contract

- Components are driven by props and host events; they do not fetch product data.
- Copy and labels come from the host or its i18n layer.
- Agent progress is rendered by `AgentProgress` and receives the live
  `plan_update` todo state through `TasksCard`.
- Components honor reduced-motion preferences and remain controlled by stable
  props so the host can test every state.

The package root is the only public identity. Consumers should import from
`@magic-resume/genui`; internal folders are implementation details.
