---
name: resume-analysis
description: Diagnose a resume from recruitment, ATS and peer viewpoints without changing it.
allowed-tools: read_resume analyze_resume push_ui
---

# Resume analysis

## Goal

Identify the most consequential resume issues with evidence and practical remedies.

## Use and exclusions

Use for a general resume assessment. Use job-fit for a particular JD and optimization for an authorized rewrite. This skill never writes the resume, even in cocreate mode.

## Preconditions

A current resume must be available. Read `references/rubric.md` when interpreting the report.

## Procedure

1. Call `analyze_resume`; it reads the workspace and runs separate reviewer assessments.
2. Inspect the structured report and its evidence references. Treat missing evidence as unknown rather than as a negative fact about the candidate.
3. Prioritize high-severity issues, then medium and low. Give a specific fix for each important gap and distinguish presentation problems from missing source material.
4. Summarize the most useful next action without repeating the entire report.

## Completion

A multi-perspective report and supported improvement actions are visible. The source resume is unchanged.

## Failure fallback

If the resume is unavailable, ask for a snapshot in a resume-aware mode. If model output is invalid, retry the assessment with the reported corrections or explain that a reliable score is unavailable; do not invent one.

## Output constraints

No write_file, edit_file or change-note calls. Scores are advisory and must be grounded in the available document.
