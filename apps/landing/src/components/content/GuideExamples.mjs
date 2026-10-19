import { createElement as h } from 'react';
import { publicExemplars } from '../../lib/public-knowledge.mjs';

/** Recheck provenance at the render boundary, even for preloaded data. */
export default function GuideExamples({ entries }) {
  return h('ul', { className: 'mt-5 space-y-5' }, publicExemplars(entries).map((entry) =>
    h('li', { key: entry.id, className: 'rounded-xl border border-hair bg-surface/30 p-6' },
      h('p', { className: 'whitespace-pre-wrap leading-8 text-ink' }, entry.content),
      entry.rationale && h('p', { className: 'mt-3 leading-7 text-muted' }, entry.rationale),
      entry.sourceNote && h('p', { className: 'mt-3 text-mr-caption text-muted' }, entry.sourceNote),
    ),
  ));
}
