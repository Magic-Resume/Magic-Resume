---
name: resume-creation
description: Build a new resume through optional, short evidence-collection steps.
allowed-tools: read_resume request_form ask_choice write_file edit_file explain_changes push_ui
---

# Resume creation

## Goal

Create a complete, schema-valid draft using only facts supplied by the user.

## Use and exclusions

Use when starting a resume or organizing an inventory of source material. Use optimization for an existing resume that needs rewriting; use direct advice for a small writing question.

## Preconditions

Creation requires cocreate mode. If no resume exists, read `assets/blank-resume.json` relative to this skill as the starting structure. Use existing JSON when available. Never put the asset's metadata into an experience entry.

## Procedure

Before collecting or drafting, call `write_todos` with 3–5 user-facing steps, such as confirm the target, gather evidence, draft sections, and check the proposal. Mark the current step in_progress. After each completed step, call `write_todos` again with the full updated list. Do not mark skipped or blocked work as completed; describe the remaining gap.

Read `references/collection.md` for questions, skip handling and early-career sources.

1. Read the current source when present. Reuse facts already supplied instead of asking for them again.
2. Use `request_form` with `create_target`, then `create_inventory`.
3. Collect one entry at a time with `create_education`, `create_experience`, `create_project`, and `create_skills`, only for the materials the user has. Each step can be skipped. Use `ask_choice` only when another entry is a necessary decision.
4. Write concise descriptions supported by those answers. Leave unknown facts empty; a skipped step does not justify fictional examples.
5. Preserve source IDs or assign new unique IDs to new entries. Keep keyed sections and sectionOrder consistent. Review the JSON and issue one full `write_file` to `/workspace/resume.json`.

## Completion

A complete JSON draft has been accepted by the write tool and is offered for browser review.

## Failure fallback

Without form tools, ask a concise text question and end the turn. After a skipped step, continue with known facts. In read-only modes, explain the collection plan without writing.

## Output constraints

Do not paste the whole resume into chat, claim it is saved, or request fabricated numbers to fill gaps. Mention any incomplete sections once.
