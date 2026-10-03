import React from 'react';
import { Editable } from '../renderer/EditableCanvas';
import { getFieldEntry } from '../fieldAccess';

/** Resolve the displayed fallback to its actual writable field. */
export function EditableField({ item, field, sectionKey, label }: {
  item: Record<string, unknown>;
  field: string | string[] | undefined;
  sectionKey?: string;
  label: string;
}) {
  const entry = getFieldEntry(item, field);
  if (!entry) return null;
  // Nested paths and computed/numeric values cannot use the flat string writer.
  if (!sectionKey || item.id == null || !/^\w+$/.test(entry.key) || typeof item[entry.key] !== 'string') {
    return <>{entry.value}</>;
  }
  return (
    <Editable
      target={{ sectionKey, itemId: String(item.id), fieldKey: entry.key, kind: 'text', label }}
      text={entry.value}
    />
  );
}
