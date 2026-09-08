'use client';

import React, { useMemo } from 'react';
import { Check, LayoutTemplate, TriangleAlert } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { WidgetItem, WidgetPanel, WidgetShell } from '@magic-resume/genui';
import type { WidgetProps } from '@magic-resume/genui';
import {
  compile,
  renderTreeNodeDom,
  validateTemplate,
  type TemplateDocument,
} from '@magic-resume/resume-templates';
import { useResumeDocumentStore } from '@/store/resume/document';

type ReplicaProps = {
  template: TemplateDocument;
  note?: string;
};

/**
 * The result of `replicate_template` is intentionally just a JSON tree. The
 * model has no browser renderer and must not save a user's résumé, so this
 * card is the client-side hand-off: validate, preview using the real résumé,
 * then let the user explicitly apply it.
 */
export default function TemplateReplicaCard({ instance, onAction }: WidgetProps) {
  const { t } = useTranslation();
  const activeResume = useResumeDocumentStore((state) => state.activeResume);
  const updateResume = useResumeDocumentStore((state) => state.updateResume);
  const { template, note } = instance.props as ReplicaProps;

  const preview = useMemo(() => {
    const validation = validateTemplate(template);
    if (!validation.ok) {
      return { root: null, diagnostics: validation.diagnostics.map((d) => d.message) };
    }

    try {
      const compiled = compile(
        template,
        (activeResume ?? {}) as unknown as Record<string, unknown>,
      );
      return {
        root: compiled.root,
        diagnostics: compiled.diagnostics.map((diagnostic) => diagnostic.message),
      };
    } catch {
      // Model-produced JSON is untrusted. A malformed tree must degrade to a
      // readable card, never take down the conversation containing it.
      return {
        root: null,
        diagnostics: [t('aiLab.widgets.templateReplica.previewFailed')],
      };
    }
  }, [activeResume, t, template]);

  const applied = instance.status === 'submitted';
  const canApply = Boolean(activeResume && preview.root && !applied);

  const apply = () => {
    if (!activeResume || !preview.root) return;
    updateResume(activeResume.id, { templateOverride: template });
    onAction({ type: 'submit', values: { template_replica: 'applied' } });
  };

  return (
    <WidgetShell density="block" width="wide">
      <div className="flex items-start gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-mr-accent-tint">
          <LayoutTemplate size={14} className="text-mr-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-mr-caption font-medium leading-snug text-mr-ink">
            {t('aiLab.widgets.templateReplica.title')}
          </p>
          {note ? <p className="mt-0.5 text-xs leading-relaxed text-mr-ink-secondary">{note}</p> : null}
        </div>
      </div>

      {preview.root ? (
        <WidgetItem className="mt-3">
          <div className="h-56 overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
            <div
              className="pointer-events-none w-[794px] origin-top-left text-black"
              style={{ transform: 'scale(0.46)' }}
            >
              {renderTreeNodeDom(preview.root)}
            </div>
          </div>
        </WidgetItem>
      ) : (
        <WidgetPanel className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-mr-ink-secondary">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <span>{preview.diagnostics[0] ?? t('aiLab.widgets.templateReplica.previewFailed')}</span>
        </WidgetPanel>
      )}

      {preview.diagnostics.length > 0 && preview.root ? (
        <WidgetItem className="mt-2 text-mr-label leading-relaxed text-mr-ink-secondary">
          {t('aiLab.widgets.templateReplica.diagnostics', {
            count: preview.diagnostics.length,
          })}
        </WidgetItem>
      ) : null}

      <WidgetItem className="mt-3 flex items-center justify-end gap-2">
        {applied ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
            <Check size={14} />
            {t('aiLab.widgets.templateReplica.applied')}
          </span>
        ) : (
          <button
            type="button"
            disabled={!canApply}
            onClick={apply}
            className="inline-flex items-center gap-1.5 rounded-lg bg-mr-accent-tint px-3 py-1.5 text-xs font-medium text-mr-accent transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Check size={13} />
            {t('aiLab.widgets.templateReplica.apply')}
          </button>
        )}
      </WidgetItem>
    </WidgetShell>
  );
}
