'use client';

import React from 'react';
import { LayoutTemplate } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { Gallery, WidgetItem, WidgetShell } from '@magic-resume/genui';
import type { WidgetOption, WidgetProps } from '@magic-resume/genui';
import { templateManifestList } from '@magic-resume/resume-templates';
import ResumeMiniPreview from '@/app/dashboard/_components/ResumeMiniPreview';
import { useResumeDocumentStore } from '@/store/resume/document';

/**
 * Pick a résumé template without leaving the conversation.
 *
 * Lives in the app rather than the component package because it is domain UI —
 * it knows what a template is and how to apply one. The package supplies the
 * grid; everything a tile shows comes from here.
 *
 * `interaction: 'client'`: switching template is a local edit that the user
 * reviews by looking at the canvas. Round-tripping it through the agent would
 * add a pause and a token bill for a decision already made.
 */
export default function TemplateGalleryCard({ instance }: WidgetProps) {
  const { t } = useTranslation();
  const activeResume = useResumeDocumentStore((s) => s.activeResume);
  const updateTemplate = useResumeDocumentStore((s) => s.updateTemplate);
  const current = activeResume?.template ?? '';

  const options: WidgetOption[] = templateManifestList.map((m) => ({ value: m.id, label: m.name }));
  const byId = new Map(templateManifestList.map((m) => [m.id, m]));

  const message =
    typeof instance.props.message === 'string' && instance.props.message
      ? (instance.props.message as string)
      : t('aiLab.widgets.gallery.template');

  return (
    <WidgetShell density="block">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-mr-accent-tint">
          <LayoutTemplate size={14} className="text-mr-accent" />
        </div>
        <span className="text-mr-caption text-mr-ink leading-snug">{message}</span>
      </div>

      <WidgetItem className="mt-3">
        <Gallery
          options={options}
          value={current}
          onChange={updateTemplate}
          renderTile={(option: WidgetOption) => {
            // options 是从 templateManifestList 生成的，所以 value 一定是合法 id；
            // Gallery 的签名是通用的 string，这里收回到模板 id 的类型。
            const tpl = byId.get(option.value as (typeof templateManifestList)[number]['id'])
              ?.template;
            return (
              <div className="aspect-[210/297] w-full bg-paper">
                {tpl && <ResumeMiniPreview template={tpl} />}
              </div>
            );
          }}
        />
      </WidgetItem>
    </WidgetShell>
  );
}
