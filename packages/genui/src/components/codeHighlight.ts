import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import html from 'highlight.js/lib/languages/xml';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';

/** The semantic token names understood by CodeBlock's single visual treatment. */
export type TokenKind = 'kw' | 'str' | 'num' | 'fn' | 'dim' | 'com';

export interface CodeToken {
  text: string;
  kind?: TokenKind;
}

/**
 * Keep the display name and grammar alias in one place. Markdown only needs to
 * forward the fence's short name; consumers outside the web app can use the
 * same mapping without importing an app module.
 */
export const LANG_LABEL: Readonly<Record<string, string>> = {
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JavaScript',
  py: 'Python',
  python: 'Python',
  sh: 'Shell',
  shell: 'Shell',
  bash: 'Shell',
  json: 'JSON',
  jsonc: 'JSON',
  json5: 'JSON',
  md: 'Markdown',
  markdown: 'Markdown',
  css: 'CSS',
  html: 'HTML',
  xml: 'HTML',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
};

/** Short names accepted by the highlighter, including Markdown fence names. */
const LANG_GRAMMAR: Readonly<Record<string, string>> = {
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'javascript',
  py: 'python',
  python: 'python',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  css: 'css',
  html: 'xml',
  xml: 'xml',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
};

const lowlight = createLowlight({
  bash,
  css,
  javascript,
  json,
  python,
  sql,
  typescript,
  yaml,
  xml: html,
});

// highlight.js uses a handful of compound classes (for example
// `title.function_`). Keep this mapping local so its theme never leaks into
// the application. The renderer owns the actual colours.
const CLASS_KIND: Readonly<Record<string, TokenKind>> = {
  keyword: 'kw',
  built_in: 'kw',
  type: 'kw',
  operator: 'kw',
  string: 'str',
  regexp: 'str',
  char: 'str',
  number: 'num',
  literal: 'num',
  title: 'fn',
  'title.function_': 'fn',
  function_: 'fn',
  attr: 'fn',
  property: 'fn',
  section: 'fn',
  comment: 'com',
  quote: 'com',
  punctuation: 'dim',
  meta: 'dim',
};

type HastNode = {
  type: string;
  value?: string;
  properties?: unknown;
  children?: HastNode[];
};

function tokenKind(properties: unknown): TokenKind | undefined {
  if (!properties || typeof properties !== 'object') return undefined;
  const classes = (properties as { className?: unknown }).className;
  if (!Array.isArray(classes)) return undefined;

  for (const value of classes) {
    if (typeof value !== 'string') continue;
    const name = value.startsWith('hljs-') ? value.slice(5) : value;
    const kind = CLASS_KIND[name];
    if (kind) return kind;
  }
  return undefined;
}

function flatten(node: HastNode, inherited?: TokenKind): CodeToken[] {
  if (node.type === 'text') {
    return node.value ? [{ text: node.value, kind: inherited }] : [];
  }

  // A few JSON grammars nest a more generic class (for example
  // `literal`) around a `keyword` child. The outer class is the semantic
  // owner; letting the child overwrite it would turn `true`/`null` into
  // snippet keywords instead of values.
  const own = inherited ?? tokenKind(node.properties);
  return (node.children ?? []).flatMap((child) => flatten(child, own));
}

/**
 * highlight.js is deliberately forgiving, but forgiving grammars can colour
 * an unfinished string or block comment all the way to EOF while a response
 * is streaming. Keep the part on the current line coloured and make the
 * remainder plain until the syntax is complete.
 */
function protectIncompleteTokens(tokens: CodeToken[]): CodeToken[] {
  return tokens.flatMap((token) => {
    if (!token.kind || !token.text.includes('\n')) return [token];

    if (
      token.kind === 'com' &&
      token.text.startsWith('/*') &&
      !token.text.includes('*/')
    ) {
      const newline = token.text.indexOf('\n');
      return [
        { text: token.text.slice(0, newline), kind: token.kind },
        { text: token.text.slice(newline), kind: undefined },
      ];
    }

    if (token.kind === 'str') {
      const firstLine = token.text.slice(0, token.text.indexOf('\n'));
      const opening = firstLine.trimStart()[0];
      // Single and double quoted strings cannot legally cross a line. A
      // backtick or Python triple quote may, so retain a complete multiline
      // literal when its delimiter closes later in the token.
      if (
        (opening === '"' || opening === "'") &&
        (firstLine.trimStart().startsWith(opening.repeat(3))
          ? !hasClosingQuote(token.text.trimStart(), opening)
          : !hasClosingQuote(firstLine, opening))
      ) {
        const newline = token.text.indexOf('\n');
        return [
          { text: token.text.slice(0, newline), kind: token.kind },
          { text: token.text.slice(newline), kind: undefined },
        ];
      }
    }

    return [token];
  });
}

/** A number of grammars intentionally leave punctuation as plain text. Add
 * the missing dim layer without touching characters already owned by strings
 * and comments. */
function markPunctuation(tokens: CodeToken[]): CodeToken[] {
  return tokens.flatMap((token) => {
    if (token.kind) return [token];
    const parts = token.text.split(/([{}[\]()<>,;:.=+\-*/%!&|?])/g);
    return parts.filter(Boolean).map((part) => ({
      text: part,
      kind: /^[{}[\]()<>,;:.=+\-*/%!&|?]$/.test(part)
        ? ('dim' as const)
        : undefined,
    }));
  });
}

function hasClosingQuote(value: string, quote: string): boolean {
  const delimiter = value.startsWith(quote.repeat(3)) ? quote.repeat(3) : quote;
  let escaped = false;
  for (
    let index = delimiter.length;
    index <= value.length - delimiter.length;
    index += 1
  ) {
    const char = value[index];
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (value.startsWith(delimiter, index)) {
      return true;
    }
  }
  return false;
}

/** Return the user-facing language label while preserving unknown input. */
export function languageLabel(lang?: string): string | undefined {
  const value = lang?.trim();
  if (!value) return undefined;
  return LANG_LABEL[value.toLowerCase()] ?? value;
}

/** Normalize a language fence to one of the grammars registered above. */
export function normalizeLanguage(lang?: string): string | undefined {
  const value = lang?.trim().toLowerCase();
  return value ? LANG_GRAMMAR[value] : undefined;
}

/** @deprecated Kept as a source-compatible helper; grammar selection is now lowlight-owned. */
export function languageFamily(lang?: string): 'json' | 'hash' | 'clike' {
  const grammar = normalizeLanguage(lang);
  if (grammar === 'json') return 'json';
  if (grammar === 'python' || grammar === 'bash' || grammar === 'yaml')
    return 'hash';
  return 'clike';
}

/** Highlight a code string, or return it as plain text for an unknown language. */
export function tokenizeCode(code: string, lang?: string): CodeToken[] {
  const grammar = normalizeLanguage(lang);
  if (!grammar || !lowlight.registered(grammar)) return [{ text: code }];

  try {
    const tree = lowlight.highlight(grammar, code) as unknown as HastNode;
    return markPunctuation(protectIncompleteTokens(flatten(tree)));
  } catch {
    // A malformed or newly-added grammar must not blank a streamed answer.
    return [{ text: code }];
  }
}

/** Split highlighted tokens into lines without changing the copied source. */
export function tokenizeCodeLines(code: string, lang?: string): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokenizeCode(code, lang)) {
    const parts = token.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: token.kind });
    });
  }
  return lines;
}
