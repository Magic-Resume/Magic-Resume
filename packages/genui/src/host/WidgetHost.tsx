"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import type {
  WidgetActionResult,
  WidgetInstance,
  WidgetRegistry,
  WidgetRenderContext,
} from "../contract";

/**
 * Dispatches a widget message to its registered component. An unknown kind, or
 * props that fail the descriptor's `normalize`, degrade to a plain text line —
 * a stray widget must never break the conversation it appears in.
 *
 * The registry is passed in rather than imported: which widgets exist is the
 * consuming app's contract with its agent, not this package's.
 */
export default function WidgetHost({
  registry,
  instance,
  onAction,
  context,
}: {
  registry: WidgetRegistry;
  instance: WidgetInstance;
  onAction: (widgetId: string, result: WidgetActionResult) => void;
  context?: WidgetRenderContext;
}) {
  const { t } = useTranslation();
  const descriptor = registry[instance.kind];
  const normalized = descriptor?.normalize
    ? descriptor.normalize(instance.props)
    : instance.props;

  if (!descriptor || !normalized) {
    return (
      <div className="text-[11px] text-muted">
        <span className="truncate">
          {t("aiLab.widgets.unsupported", { kind: instance.kind })}
        </span>
      </div>
    );
  }

  const Component = descriptor.component;
  return (
    <Component
      instance={{ ...instance, props: normalized }}
      context={context}
      onAction={(result) => onAction(instance.widgetId, result)}
    />
  );
}
