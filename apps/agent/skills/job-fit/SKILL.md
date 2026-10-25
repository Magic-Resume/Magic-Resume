---
name: job-fit
description: Compare a resume with a specific job description and explain evidence-backed gaps.
allowed-tools: read_resume evaluate_fit request_form ask_choice push_ui
---

# Job fit

## Goal

Show which job requirements have resume support and which need additional evidence or preparation.

## Use and exclusions

Use for a specific job's requirements. Use resume-analysis for an overall assessment. This is a read-only report, not a rewrite.

## Preconditions

A current resume and full JD text are required. A URL alone is insufficient when browsing is unavailable. Read `references/scoring.md` to interpret the report.

## Procedure

1. Locate the JD in the conversation. If it is missing, use `request_form(job_info)` once.
2. Call `evaluate_fit` with the full supplied JD. It extracts requirements and evaluates each against resume evidence.
3. Distinguish evidence-supported matches, missing keywords and substantive gaps. Suggest concrete ways to verify or strengthen the evidence; do not imply that adding a keyword creates experience.
4. State location conflicts separately and identify the most useful next step.

## Completion

The fit report is visible with a weighted score, requirement evidence, gaps and keyword coverage. No resume write occurred.

## Failure fallback

If the JD is skipped, explain that a role-specific score cannot be established. Without forms, ask for the JD in text and end. Invalid assessment output must be corrected or reported as unavailable.

## Output constraints

Do not write the resume or repeat all report entries in chat. Never fabricate a match.
