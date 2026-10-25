---
name: resume-translation
description: Translate resume prose into a requested language while retaining structure and factual content.
allowed-tools: read_resume request_form ask_choice explain_changes write_file edit_file push_ui
---

# Resume translation

## Goal

Translate the current resume faithfully without changing its evidence or identity structure.

## Use and exclusions

Use for a requested document-language change. Use optimization when the main request is rewriting for a role. A small pasted sentence can be translated directly in chat.

## Preconditions

Read the exact JSON and identify the target language. Writes require cocreate mode. Consult `references/preservation.md` before writing.

## Procedure

1. Use `read_resume`. If the target language is absent, use `request_form(target_language)` once; read its submitted `lang` value.
2. Translate user-visible prose section by section. Retain IDs, section keys, field keys, URLs, dates, numbers, names and custom fields.
3. Set documentLanguage to the supported language identifier and documentLanguageSource to explicit. Do not add experience or improve the facts while translating.
4. Compare source and translation for omissions, valid HTML and unchanged structural keys. Record specific reasons only for meaningful field changes, then write the complete JSON once to `/workspace/resume.json`.

## Completion

A valid translated proposal retains every source entry and is ready for browser review.

## Failure fallback

If the target language is skipped or unclear, retain the source and ask one short text question. In read-only modes, explain the translation plan without writing. Preserve ambiguous terms rather than inventing official names.

## Output constraints

Do not reproduce the entire translated resume in chat or claim it has been saved. Mention any uncertain terminology briefly.
