import {
  DOCUMENT_LANGUAGES,
  documentSectionTitle,
  normalizeDocumentLanguage,
  resolveDocumentLanguage,
} from '@magic-resume/resume-schema';
import type { Resume } from '@/types/frontend/resume';
import type { PendingChange, DocumentChange } from './changeModel';
import type { BatchKind, TargetedSelectionDiff } from './diffResume';

export function documentChangeToPending(change: DocumentChange): PendingChange {
  const label =
    change.field === 'documentLanguage' ? '简历语言' : '章节标题与顺序';
  const display = (value: DocumentChange['before']) =>
    Array.isArray(value)
      ? value.map((section) => section.title || (section.label?.startsWith('sections.') ? documentSectionTitle(section.key, 'zh') : section.label) || section.key).join('\n')
      : DOCUMENT_LANGUAGES.find((language) => language.value === value)
          ?.label || '自动识别';
  return {
    id: `document:${change.field}`,
    target: {
      sectionKey: 'document',
      itemId: 'settings',
      fieldKey: change.field,
      kind: 'text',
      label,
    },
    before: display(change.before),
    after: display(change.after),
    documentChange: change,
    rationale: '',
    action: 'translate',
    seed: 0,
    status: 'pending',
  };
}

/** Metadata is proposed along with a whole-document translation, never a selection. */
export function diffDocumentChanges(
  current: Resume,
  proposed: Partial<Resume>,
  context: {
    kind: BatchKind;
    lang?: string;
    targetedSelection?: TargetedSelectionDiff;
  },
): PendingChange[] {
  if (context.targetedSelection) return [];
  const changes: PendingChange[] = [];
  const language =
    context.kind === 'translate'
      ? (normalizeDocumentLanguage(context.lang) ??
        normalizeDocumentLanguage(proposed.documentLanguage))
      : normalizeDocumentLanguage(proposed.documentLanguage);
  if (language && language !== current.documentLanguage) {
    const change = documentChangeToPending({
      field: 'documentLanguage',
      before: current.documentLanguage,
      after: language,
    });
    change.before = DOCUMENT_LANGUAGES.find(
      (item) => item.value === resolveDocumentLanguage(current),
    )!.label;
    changes.push(change);
  }
  const nextOrder = proposed.sectionOrder;
  if (
    nextOrder?.length &&
    JSON.stringify(nextOrder) !== JSON.stringify(current.sectionOrder)
  ) {
    const change = documentChangeToPending({
      field: 'sectionOrder',
      before: current.sectionOrder,
      after: nextOrder,
    });
    const headingList = (resume: Resume) =>
      resume.sectionOrder
        .map(
          (entry) =>
            entry.title ||
            (entry.label?.startsWith('sections.')
              ? documentSectionTitle(entry.key, resolveDocumentLanguage(resume))
              : entry.label) ||
            entry.key,
        )
        .join('\n');
    change.before = headingList(current);
    change.after = headingList({
      ...current,
      ...proposed,
      documentLanguage: language ?? current.documentLanguage,
      sectionOrder: nextOrder,
    });
    changes.push(change);
  }
  return changes;
}

/** Return null on a concurrent edit. Metadata and content can be committed in one store update. */
export function applyDocumentChange(
  resume: Resume,
  change: DocumentChange,
): Resume | null {
  if (JSON.stringify(resume[change.field]) !== JSON.stringify(change.before))
    return null;
  return change.field === 'documentLanguage'
    ? {
        ...resume,
        documentLanguage: change.after,
        documentLanguageSource: 'explicit',
      }
    : { ...resume, sectionOrder: change.after };
}
