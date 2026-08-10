'use client';

import React, { useState } from 'react';
import { Check, X, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@magic-resume/utils';
import { WidgetItem, WidgetShell } from '../motion';
import {
  Chips,
  FIELD_LABEL,
  FIELD_SURFACE,
  MiniSelect,
  MonthRange,
  MultiChips,
  SearchPick,
  Segmented,
} from '../primitives';
import type { WidgetFormField, WidgetProps } from '../contract';

function initialValues(fields: WidgetFormField[]): Record<string, string> {
  const v: Record<string, string> = {};
  fields.forEach((f) => {
    // Only `select` pre-picks: it has no empty state, so leaving it blank would
    // submit a value the user never saw. Chips and segmented start unchosen on
    // purpose — a default there reads as an answer the user did not give.
    v[f.id] = f.kind === 'select' ? f.options?.[0]?.value ?? '' : '';
  });
  return v;
}

/** One line standing in for a filled-in form: "前端开发 · 互联网 · 应届". */
function summarize(fields: WidgetFormField[], values: Record<string, string>): string {
  return fields
    .map((f) => values[f.id]?.trim())
    .filter((v): v is string => Boolean(v))
    .join(' · ');
}

function Field({
  field,
  value,
  widgetId,
  onChange,
}: {
  field: WidgetFormField;
  value: string;
  widgetId: string;
  onChange: (next: string) => void;
}) {
  const options = field.options ?? [];

  switch (field.kind) {
    case 'chips':
      return (
        <Chips
          options={options}
          value={value}
          onChange={onChange}
          allowCustom={field.allowCustom}
          clearable={field.optional}
          placeholder={field.placeholder}
        />
      );
    case 'multi-chips':
      return (
        <MultiChips
          options={options}
          value={value}
          onChange={onChange}
          allowCustom={field.allowCustom}
          placeholder={field.placeholder}
        />
      );
    case 'segmented':
      return (
        <Segmented
          options={options}
          value={value}
          onChange={onChange}
          layoutId={`${widgetId}:${field.id}`}
        />
      );
    case 'month-range':
      return <MonthRange value={value} onChange={onChange} />;
    case 'search':
      return (
        <SearchPick
          value={value}
          onChange={onChange}
          source={field.source}
          placeholder={field.placeholder}
        />
      );
    case 'textarea':
      return (
        <textarea
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(FIELD_SURFACE, 'resize-y min-h-[120px] px-3.5 py-2.5 leading-relaxed')}
        />
      );
    case 'select':
      // MiniSelect 而不是原生 select：原生的会弹系统菜单（浅色面板 + 系统高亮蓝），
      // 在深色工作台里像开了个洞。
      return (
        <MiniSelect
          value={value}
          options={options.map((o) => o.value)}
          placeholder={field.placeholder}
          ariaLabel={field.label}
          widthClass="w-full"
          onChange={onChange}
        />
      );
    default:
      return (
        <input
          type="text"
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(FIELD_SURFACE, 'h-9 px-3')}
        />
      );
  }
}

/**
 * The generic GenUI form card. The agent asks for structured input by name
 * (a form kind); the consuming app's registry resolves that to the field
 * layout and hands it here already normalized, so the model can never emit a
 * malformed field schema. The user fills it inline and submits; the app
 * decides where the values go (resume the paused run, send a message, …).
 *
 * The point of the richer field kinds is that anything enumerable should be a
 * tap, not typing. Free text is reserved for what genuinely is prose — what
 * you actually did on a project — and even that can be skipped.
 *
 * Once resolved the card collapses to a single summary line. A conversation
 * that collects several of these otherwise scrolls as a wall of forms the user
 * has already dealt with.
 */
export default function FormCard({ instance, onAction }: WidgetProps) {
  const { t } = useTranslation();
  const props = instance.props as {
    title?: string;
    message?: string;
    fields?: WidgetFormField[];
    /** this step may be passed over entirely — the flow continues without it. */
    skippable?: boolean;
  };
  const fields = props.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));
  const resolved = instance.status !== 'pending';
  const set = (id: string, val: string) => setValues((prev) => ({ ...prev, [id]: val }));

  const missingRequired = fields.some((f) => !f.optional && !(values[f.id] ?? '').trim());

  // Empty when a stored transcript is replayed: the values were never part of
  // the message, only this component's state. Fall back to the status chip.
  const summary = instance.status === 'submitted' ? summarize(fields, values) : '';

  return (
    <WidgetShell className="min-w-[280px] max-w-md flex-1 rounded-2xl bg-raised px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-tint-sky">
          <ClipboardList size={14} className="text-ink-sky" />
        </div>
        <span className="text-[13px] font-medium text-primary shrink-0">
          {props.title || t('aiLab.widgets.form.defaultTitle')}
        </span>
        {resolved && (
          <>
            {summary && (
              <span className="text-xs text-secondary truncate" title={summary}>
                {summary}
              </span>
            )}
            <span
              className={cn(
                'ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full shrink-0',
                instance.status === 'submitted'
                  ? 'text-ink-sky bg-tint-sky'
                  : 'text-muted bg-sunk',
              )}
            >
              {instance.status === 'submitted' ? <Check size={12} /> : <X size={12} />}
              {t(`aiLab.widgets.form.${instance.status}`)}
            </span>
          </>
        )}
      </div>

      {/* 收起用 grid-rows 0fr↔1fr 过渡，不用 framer 的 layout：后者靠 scale 做尺寸
          动画，缩放期间整块文字都会发虚。这条只动 grid-template-rows，不产生变换。
          内容保持挂载才有得可过渡，收起后用 inert 把它从焦点顺序里摘掉。 */}
      <div
        inert={resolved || undefined}
        aria-hidden={resolved || undefined}
        className={cn(
          'grid transition-[grid-template-rows] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          resolved ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="overflow-hidden min-h-0">
          {props.message && (
            <WidgetItem className="mt-2 text-xs text-secondary leading-relaxed">
              {props.message}
            </WidgetItem>
          )}
          <div className="mt-3 space-y-3">
            {fields.map((f) => (
              <WidgetItem key={f.id}>
                <label className={FIELD_LABEL}>
                  {f.label}
                  {f.optional && (
                    <span className="ml-1 text-muted/70">
                      （{t('aiLab.widgets.field.optional')}）
                    </span>
                  )}
                </label>
                <Field
                  field={f}
                  value={values[f.id] ?? ''}
                  widgetId={instance.widgetId}
                  onChange={(next) => set(f.id, next)}
                />
              </WidgetItem>
            ))}
          </div>
          <WidgetItem className="mt-3.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onAction({ type: 'cancel' })}
              className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-primary transition-colors cursor-pointer"
            >
              {props.skippable ? t('aiLab.widgets.field.skip') : t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={missingRequired}
              onClick={() => onAction({ type: 'submit', values })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors',
                missingRequired
                  ? 'bg-sunk text-muted cursor-not-allowed'
                  : 'bg-fill-sky hover:bg-ink-sky-hover text-on-fill-sky cursor-pointer',
              )}
            >
              <Check size={13} />
              {t('aiLab.widgets.form.submit')}
            </button>
          </WidgetItem>
        </div>
      </div>
    </WidgetShell>
  );
}
