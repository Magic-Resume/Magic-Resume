# Faithful resume translation

## Terminology and names

Build a small consistent glossary from the document before translating repeated terms. Keep established technology names, code identifiers, acronyms, email addresses and URLs unchanged. Expand an acronym only when its meaning is known and useful. Do not translate a product name into an unrelated ordinary word.

Preserve a person's supplied spelling; do not invent an English name or guess romanization. Use an official bilingual organization name only if supplied or unambiguous; otherwise retain the original name, optionally alongside a conservative descriptive translation. Preserve an unknown abbreviation and flag it briefly.

## Positions and responsibility

Translate role scope rather than prestige. “主管” may describe a supervisor, not a director; “工程师” does not imply Senior Engineer. Distinguish individual contributor, supervisor and manager based on actual duties. Keep internship, part-time, volunteer and coursework labels. Do not turn participation into leadership or an internal working title into a licensed professional credential.

English bullets normally omit “I”, use past tense for completed contributions and present tense for ongoing duties. Chinese bullets favor concise action phrases without forced pronouns. A faithful translation may adjust word order and remove grammar-only repetition, but cannot add a new skill, method or result.

## Degrees, dates and places

Use the supplied degree and discipline. 本科 describes a level of study; do not assume Bachelor of Science rather than Bachelor of Arts without evidence. “在读” remains in progress, “预计毕业” remains expected, and a certificate is not a degree. Preserve institution names if no verified translation is supplied. Avoid converting grades or degree classifications between systems.

Keep date values, precision and ranges. Translate “至今” as “Present” and the reverse when appropriate. Do not invent a month for a year-only date, resolve an ambiguous numeric date silently, or convert academic years to calendar dates. Preserve time zones where supplied. Maintain units, currency symbols, decimal magnitude and percentage versus percentage-point distinctions.

For places, use a well-established equivalent only when clear. Retain district and street details in their original form if a translation would create ambiguity. Do not infer a country, work authorization or willingness to relocate from a place name.

## Common mistranslations to avoid

- “参与开发” → “Led development”: use “Contributed to development” unless leadership is explicit.
- “应届毕业生” → “Experienced graduate”: use “Recent graduate” or the stated expected graduation status.
- “实习生” → a permanent job title: retain “Intern”.
- “落地” → “landed”: use “implemented” or “delivered” only for what actually shipped.
- “负责” → “owned” in every context: choose “maintained”, “implemented” or “supported” according to the source.
- “研究生” → “PhD”: retain the stated master's/doctoral level or leave it ambiguous pending clarification.
- “提升 5 个百分点” → “improved by 5%”: use “increased by 5 percentage points”.
- “平台” → “platform” when it names a website or internal tool: preserve the actual artifact and scope.

## Format and completeness checklist

Before writing, compare source and target entry by entry:

- Same IDs, keyed sections, sectionOrder, field keys and custom-field structure; no source entry dropped.
- Only display text translated. Preserve links, contact values, filenames, technology identifiers and machine-readable metadata.
- Valid HTML remains valid; keep paragraphs, lists, emphasis and anchors, translate their visible text, preserve href values and nesting.
- Dates, numbers, units, credentials, employer and personal names match source facts.
- Repeated terms and tense are consistent; the target has no accidental untranslated prose except deliberate names and terms.
- Set documentLanguage to a supported target identifier and documentLanguageSource to explicit; keep presentation metadata unless requested otherwise.
- Validate the full JSON and confirm the write succeeded. Mention uncertain terminology once without claiming a saved document change.
