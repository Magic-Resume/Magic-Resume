---
name: resume-optimization
description: Rewrite an existing resume toward a supplied role while preserving facts and structure.
allowed-tools: read_resume evaluate_fit analyze_resume request_form ask_choice explain_changes write_file edit_file push_ui
---

# Resume optimization

## Goal

Produce a focused rewrite whose changes are traceable to source facts and the user's goal.

## Use and exclusions

Use for requested resume improvements. Use analysis for diagnosis alone and translation for language conversion alone. A selected fragment should be edited only within its requested scope.

## Preconditions

Read the exact current JSON. Actual writes require cocreate mode. Read `references/rewrite.md` for the evidence checks.

## Procedure

First call `write_todos` with 3–5 concrete, user-facing steps: review the source and target, rewrite supported claims, check facts and structure, and prepare the proposal with reasons. Set one step in_progress. Update the complete list with `write_todos` after each step; only successful work becomes completed. Register this plan before `read_resume` or any rewrite, even when a short answer might otherwise seem sufficient for the selected workflow.

1. Use `read_resume` and retain the JSON's IDs and custom fields.
2. Identify the target JD from the user's messages or submitted form. If absent and required for targeting, ask once with `request_form(job_info)`. If skipped, do general clarity improvements without guessing a target.
3. Select concrete, supported improvements: clearer actions, ownership, scope and outcomes. A JD keyword is not proof of experience.
4. Self-check every changed fact against the source or explicit user evidence; remove unsupported claims. Keep unrelated material unchanged.
5. Call `explain_changes` with one specific reason per changed section/itemId/fieldKey, then issue one `write_file` containing the complete JSON to `/workspace/resume.json`.
6. If validation or verification flags an issue, correct the actual source and retry within the remaining budget.

## Completion

A valid proposal and field-level reasons are available for review; all claimed edits have successful tool results.

## Failure fallback

In plan mode, report a concrete plan only. Without a checkpoint, ask for a missing JD in text. When evidence is insufficient, keep the original wording or make a conservative clarity edit and identify the missing evidence.

## Output constraints

Do not duplicate the canvas diff in chat. Explain the main benefit and any unresolved gap without claiming the saved document changed.
