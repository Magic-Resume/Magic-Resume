"use client";

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import GlideMenu from "../primitives/GlideMenu";

/* ─────────────────────────────────────────────────────────
 * RECORDS TABLE — 一张 AI 电子表格。列是**属性**：点表头开配置弹层
 * （类型 / 工具 / grounding / 输入 / prompt / 运行），从 + 表头加新属性，
 * 计算时单元格逐行落定。
 *
 * DOM、类名、交互逐条取自 beautiful-ui `components/primitives/RecordsTable.tsx`。
 * 唯一的偏离是**数据来源**：上游把 60 行冰淇淋供应商和 6 个列名写死在文件里，
 * 这里换成 `columns` / `rows` 受控 props——否则投递面板拿不到自己的数据。
 * 凡是上游写死的文案都变成 `labels`，凡是上游假装的能力（逐行计算）都变成
 * 调用方给的回调 + 进度：**没有真通道就不出这个按钮**，不做会转圈的假动效。
 * ───────────────────────────────────────────────────────── */

/** SSR 下 `useLayoutEffect` 会告警；浏览器里必须是 layout 时机，否则量宽会闪一帧。 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type RecordsToolKind = "model" | "web" | "user";

/** prompt 里内联的 @ 提及：`before` + 高亮 chip + `after`。 */
export interface RecordsPrompt {
  before: string;
  chip?: string;
  after?: string;
}

/** 一列作为「属性」的配置，喂给表头弹层。不给就只有列名 + 置顶 / 更多设置。 */
export interface RecordsColumnMeta {
  /** 属性类型，取 `RECORDS_TYPE_GLYPHS` 的键；决定弹层里的图标。 */
  type?: string;
  /** 产出这一列的工具名（模型名 / 「网页搜索」/「用户输入」）。 */
  tool?: string;
  toolKind?: RecordsToolKind;
  /** 计算输入，值是**其它列的 label**。 */
  inputs?: string[];
  prompt?: RecordsPrompt;
  /**
   * 类型可改。**默认不可改**。
   *
   * 上游每一列都能随手换成 JSON / File splitter，因为它是个空壳 demo。接真数据后
   * 内置列的类型是内在的——「状态」就是单选，把它改成 JSON 不对应任何东西，改完
   * 也没有地方能存。所以只有调用方明确说得动的列才给下拉。
   */
  editable?: boolean;
}

export interface RecordsColumn {
  key: string;
  label: string;
  /** 表头图标；不给就按 `meta.type` 取内置字形，再不行只有文字。 */
  icon?: ReactNode;
  /** 可排序。排序值由 `RecordsRow.sortValues[key]` 提供，缺席则回落到该列的文本。 */
  sortable?: boolean;
  /** 列宽档位，映射到 `records-*-col`；只在首次量宽前生效。 */
  width?: "sm" | "md" | "lg";
  /** 首帧之后才出现的列没法量，用这个值；不给用 240。 */
  defaultWidth?: number;
  /** 拖拽能压到的下限。 */
  minWidth?: number;
  meta?: RecordsColumnMeta;
}

export interface RecordsRow {
  id: string;
  /** 逐列的渲染内容。键对应 `RecordsColumn.key`。 */
  cells: Record<string, ReactNode>;
  /**
   * 排序用的可比较值。
   *
   * 与 `cells` 分开是必须的：`cells` 里可能是一整棵 JSX（双行、带图标、带链接），
   * 对它排序没有意义。给数字就按数字排，给字符串就按 locale 排。
   */
  sortValues?: Record<string, string | number>;
  /** 首列左侧的方形字母标；不给就不画。 */
  mark?: string;
  /** 给了就把首列内容渲染成真链接（上游 `.records-company-name.has-link`）。 */
  href?: string;
}

/** 弹层与菜单里的所有文案。`{{label}}` 会被列名替换。 */
export interface RecordsLabels {
  selectAll: string;
  selectRow: string;
  sortBy: string;
  resizeColumn: string;
  newProperty: string;
  tableOptions: string;
  addProperty: string;
  compactColumns: string;
  resetColumnWidths: string;
  clearSelection: string;
  type: string;
  propertyType: string;
  tool: string;
  model: string;
  grounding: string;
  aboutGrounding: string;
  groundingHelp: string;
  inputs: string;
  selectInputs: string;
  useValuesFrom: string;
  prompt: string;
  promptPlaceholder: string;
  goCalculate: string;
  pin: string;
  unpin: string;
  moreSettings: string;
  behavior: string;
  requiredValue: string;
  allowEmpty: string;
  showConfidence: string;
  hideFromView: string;
  calculating: string;
  /**
   * 属性类型的显示名，键是 `RECORDS_TYPE_GLYPHS` 的键。
   *
   * 存下去的值必须一直是英文键——它同时是字形查表的键。把显示名单独拿出来，
   * 中文界面才不会因为翻译了类型名就把图标弄丢。
   */
  types: Record<string, string>;
}

const DEFAULT_LABELS: RecordsLabels = {
  selectAll: "Select all",
  selectRow: "Select row",
  sortBy: "Sort by {{label}}",
  resizeColumn: "Resize {{label}} column",
  newProperty: "New property",
  tableOptions: "Table options",
  addProperty: "Add property",
  compactColumns: "Compact columns",
  resetColumnWidths: "Reset column widths",
  clearSelection: "Clear selection",
  type: "Type",
  propertyType: "Property type",
  tool: "Tool",
  model: "Model",
  grounding: "Grounding",
  aboutGrounding: "About grounding",
  groundingHelp: "Grounding lets the model verify generated values against connected sources.",
  inputs: "Inputs",
  selectInputs: "Select inputs",
  useValuesFrom: "Use values from",
  prompt: "{{label}} calculation prompt",
  promptPlaceholder: "Set a prompt (press @ to mention an input)",
  goCalculate: "Go calculate",
  pin: "Pin",
  unpin: "Unpin",
  moreSettings: "More settings",
  behavior: "Behavior",
  requiredValue: "Required value",
  allowEmpty: "Allow empty results",
  showConfidence: "Show confidence",
  hideFromView: "Hide from view",
  calculating: "Calculating…",
  types: {},
};

export interface RecordsTableProps {
  columns: RecordsColumn[];
  rows: RecordsRow[];
  /** 开行选择（首列复选框 + 全选）。 */
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  /** 页脚统计条；不给就不渲染 `tfoot`。补位的操作列单元格由本组件自己加。 */
  footer?: ReactNode;
  /** 行数为 0 时渲染它，替代空表格。 */
  emptyState?: ReactNode;
  ariaLabel: string;
  className?: string;
  /** 撑满可用高度（上游 `is-fill`）。 */
  fill?: boolean;
  labels?: Partial<RecordsLabels>;
  /** 列配置被改：调用方要持久化就接这个（组件自己也留一份本地覆盖）。 */
  onColumnMetaChange?: (key: string, meta: RecordsColumnMeta) => void;
  /** 「新属性」菜单里可选的类型。**和 `onAddColumn` 一起给才会出 + 按钮**。 */
  propertyTypes?: string[];
  onAddColumn?: (type: string) => void;
  /** 「工具」弹层里可选的模型。 */
  modelOptions?: string[];
  /**
   * 逐行计算这一列。
   *
   * 上游是 `setTimeout` 假装算——这里坚持要调用方**真有**计算通道才给按钮：
   * 一个会转圈然后凭空填出内容的列，和界面在说谎是同一件事。
   */
  onCalculate?: (key: string) => void;
  /**
   * 计算进度，由调用方驱动。
   *
   * `resolved`：前 N 行已落定（上游那种从上往下推进的形态）。
   * `pendingIds`：直接点名哪几行还没算——真实数据里「已算」往往不是个前缀
   * （补算某一行、筛选换了顺序），用序号表达就会指错格子。两者给其一即可。
   */
  calculating?: { key: string; resolved?: number; pendingIds?: string[] } | null;
  /** 给了才出「从视图中隐藏」。 */
  onHideColumn?: (key: string) => void;
}

function Icon({ children, size = 14, strokeWidth = 1.8 }: { children: ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/* 属性类型与工具的字形库 */
export const RECORDS_TYPE_GLYPHS: Record<string, ReactNode> = {
  Text: <path d="M4 6h16M4 12h10M4 18h7" />,
  File: <g><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></g>,
  Collection: <g><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></g>,
  "Single select": <g><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.4 2.4 4.6-4.9" /></g>,
  "Multi select": <g><path d="M11 6h9M11 12h9M11 18h9" /><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" /></g>,
  URL: <g><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></g>,
  Reference: <path d="M7 17 17 7M9 7h8v8" />,
  JSON: <g><path d="M8 4c-2 0-2 2-2 3s.5 3-2 3c2.5 0 2 2 2 3s0 3 2 3" /><path d="M16 4c2 0 2 2 2 3s-.5 3 2 3c-2.5 0-2 2-2 3s0 3-2 3" /></g>,
  "File splitter": <g><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></g>,
  Date: <g><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /></g>,
};

const TOOL_GLYPHS: Record<RecordsToolKind, ReactNode> = {
  model: <path d="M12 3l1.7 5.1a2 2 0 0 0 1.2 1.2L20 11l-5.1 1.7a2 2 0 0 0-1.2 1.2L12 19l-1.7-5.1a2 2 0 0 0-1.2-1.2L4 11l5.1-1.7a2 2 0 0 0 1.2-1.2z" />,
  web: <g><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a13.5 13.5 0 0 1 3.5 9 13.5 13.5 0 0 1-3.5 9 13.5 13.5 0 0 1-3.5-9A13.5 13.5 0 0 1 12 3z" /></g>,
  user: <g><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></g>,
};

const DEFAULT_PROPERTY_TYPES = ["Text", "File", "Collection", "Single select", "Multi select", "URL", "Reference", "JSON", "File splitter"];

const WIDTH_CLASS: Record<NonNullable<RecordsColumn["width"]>, string> = {
  sm: "records-link-col",
  md: "records-last-col",
  lg: "records-category-col",
};

/**
 * `WIDTH_CLASS` 那几个类在 CSS 里的像素值，抄一份到这里当**表格下限**用。
 *
 * 少了它，`table-layout: fixed` + `width: 100%` 在窄容器（比如嵌在对话里的卡片）
 * 会把各列按比例压扁——中间几列直接挤没。上游不会这样，是因为它量完宽度后给表格钉了
 * `min-width`，宽度不够就横向滚动，列宽不动。这里用声明值算同一个下限，不必先量。
 */
const NATURAL_WIDTH: Record<NonNullable<RecordsColumn["width"]>, number> = { sm: 175, md: 190, lg: 275 };
/** 首列（`records-company-col`）和没声明档位的列各自的自然宽。 */
const FIRST_COLUMN_WIDTH = 270;
const AUTO_COLUMN_WIDTH = 160;

/** 首帧之后才出现的列没得量，用上游给 AI 列的那个宽度。 */
const NEW_COLUMN_WIDTH = 240;
const ACTION_COLUMN_WIDTH = 100;

function Checkbox({ checked, mixed = false, onChange, label }: { checked: boolean; mixed?: boolean; onChange: () => void; label: string }) {
  return (
    <label className="records-checkbox" title={label} onClick={(event) => event.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
      <span className={`records-checkbox-box ${checked || mixed ? "is-active" : ""}`}>
        {mixed ? <span className="records-checkbox-dash" /> : checked ? <Icon size={12}><path d="m5 12 4 4L19 6" /></Icon> : null}
      </span>
    </label>
  );
}

/**
 * 一个标签胶囊。底色由调用方给一个中等亮度的基色，深浅两套主题各自 `color-mix`
 * 出边框 / 文字 / 底色——所以这里只传 `--tag-base`，不传三个成品颜色。
 */
export function RecordsTag({ name, color }: { name: string; color?: string }) {
  return (
    <span className="records-tag" style={{ "--tag-base": color ?? "var(--ink-3)" } as CSSProperties}>
      {name}
    </span>
  );
}

/**
 * 一格里的标签组：先离屏量一遍每个标签的宽度，再决定放得下几个，剩下的收成 `+N`。
 *
 * 用 CSS 溢出裁切做不到——被裁掉半个标签比收起来更难读，而且 `+N` 的宽度本身
 * 也要算进预算里，否则最后一个标签和 `+N` 会一起挤出去。
 */
export function RecordsTagList({ tags, colors }: { tags: string[]; colors?: Record<string, string> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () => {
      const available = container.clientWidth;
      const tagWidths = Array.from(measure.querySelectorAll<HTMLElement>("[data-tag-measure]"), (tag) => tag.offsetWidth);
      const moreWidth = measure.querySelector<HTMLElement>("[data-more-measure]")?.offsetWidth ?? 0;
      let used = 0;
      let count = 0;

      for (let index = 0; index < tagWidths.length; index += 1) {
        const nextUsed = used + (count > 0 ? 4 : 0) + tagWidths[index];
        const hiddenAfter = tags.length - (index + 1);
        const totalWithOverflow = nextUsed + (hiddenAfter > 0 ? 4 + moreWidth : 0);
        if (totalWithOverflow > available) break;
        used = nextUsed;
        count += 1;
      }

      setVisibleCount(count);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [tags]);

  const hiddenCount = tags.length - visibleCount;

  return (
    <div ref={containerRef} className="records-tags" title={tags.join(", ")}>
      <div ref={measureRef} className="records-tags-measure" aria-hidden>
        {tags.map((tag) => <span key={tag} data-tag-measure><RecordsTag name={tag} color={colors?.[tag]} /></span>)}
        <span data-more-measure className="records-more-tag">+{tags.length}</span>
      </div>
      {tags.slice(0, visibleCount).map((tag) => <RecordsTag key={tag} name={tag} color={colors?.[tag]} />)}
      {hiddenCount > 0 && <span className="records-more-tag">+{hiddenCount}</span>}
    </div>
  );
}

/** 页脚里的「+ 添加统计」。放在调用方给的 `footer` 单元格里。 */
export function RecordsAddCalculation({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button type="button" className="records-add-calculation" onClick={onClick}>
      <Icon size={15}><path d="M12 5v14M5 12h14" /></Icon>
      {label}
    </button>
  );
}

function CalcCell({ label }: { label: string }) {
  return (
    <span className="records-calc">
      <span className="records-muted">{label}</span>
      <span className="records-pulse" />
    </span>
  );
}

function MiniSwitch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="relative h-4.5 w-7.5 shrink-0 rounded-full transition-colors duration-150"
      style={{ background: on ? "var(--accent)" : "var(--line-strong)" }}
    >
      <span
        className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow-btn transition-transform duration-150"
        style={{ transform: on ? "translateX(12px)" : "translateX(0)", transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
      />
    </button>
  );
}

/** 弹层里的一条配置行。`relative` 是给右侧二级菜单当定位锚点的。 */
function ConfigRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative flex h-8 items-center justify-between">
      <span className="text-[13px] text-ink-3">{label}</span>
      {children}
    </div>
  );
}

function ConfigPicker({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  /** `value` 是存下去的那个（也是字形键），`label` 只是显示——两者在中文界面里不同。 */
  options: { value: string; label: string; icon: ReactNode }[];
  selected?: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      role="menu"
      aria-label={label}
      className="absolute left-full top-0 z-30 ml-5 w-[210px] rounded-[12px] bg-surface p-1.5 shadow-overlay"
      style={{ animation: "pop-in 140ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" }}
    >
      <div className="px-2 pb-1 pt-0.5 text-[11.5px] font-medium text-ink-3">{label}</div>
      <GlideMenu className="flex flex-col gap-px">
        {options.map((option) => (
          <button
            key={option.value}
            data-menu-row
            type="button"
            role="menuitemradio"
            aria-checked={selected === option.value}
            onClick={() => onSelect(option.value)}
            className="relative z-10 flex h-8 w-full items-center gap-1.5 rounded-[8px] px-1.5 text-left text-[13px] font-medium text-ink"
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-ink-2">{option.icon}</span>
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <span className={selected === option.value ? "text-ink" : "invisible"}>
              <Icon size={14} strokeWidth={2.2}><path d="m5 12 4 4L19 6" /></Icon>
            </span>
          </button>
        ))}
      </GlideMenu>
    </div>
  );
}

function InputPicker({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div
      role="menu"
      aria-label={title}
      className="absolute left-full top-0 z-30 ml-5 w-[220px] rounded-[12px] bg-surface p-1.5 shadow-overlay"
      style={{ animation: "pop-in 140ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" }}
    >
      <div className="px-2 pb-1 pt-0.5 text-[11.5px] font-medium text-ink-3">{title}</div>
      <GlideMenu className="flex flex-col gap-px">
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <button
              key={option}
              data-menu-row
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              onClick={() => onToggle(option)}
              className="relative z-10 flex h-8 w-full items-center gap-1.5 rounded-[8px] px-1.5 text-left text-[13px] font-medium text-ink"
            >
              <span className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border ${checked ? "border-accent bg-accent text-white" : "border-line-strong text-transparent"}`}>
                <Icon size={11} strokeWidth={2.4}><path d="m5 12 4 4L19 6" /></Icon>
              </span>
              <span className="min-w-0 flex-1 truncate">{option}</span>
            </button>
          );
        })}
      </GlideMenu>
    </div>
  );
}

/** 这一行这一列拿什么去比。没给 `sortValues` 就退回文本，纯 JSX 的列排不动是合理的。 */
function sortValueOf(row: RecordsRow, key: string): string | number {
  const explicit = row.sortValues?.[key];
  if (explicit !== undefined) return explicit;
  const cell = row.cells[key];
  return typeof cell === "string" || typeof cell === "number" ? cell : "";
}

export default function RecordsTable({
  columns,
  rows,
  selectable = false,
  onSelectionChange,
  footer,
  emptyState,
  ariaLabel,
  className = "",
  fill = false,
  labels: labelOverrides,
  onColumnMetaChange,
  propertyTypes,
  onAddColumn,
  modelOptions,
  onCalculate,
  calculating,
  onHideColumn,
}: RecordsTableProps) {
  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...labelOverrides }), [labelOverrides]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [actionColumnWidth, setActionColumnWidth] = useState(ACTION_COLUMN_WIDTH);
  const [columnWidthsLocked, setColumnWidthsLocked] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const initialColumnWidthsRef = useRef<Record<string, number> | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  /* 属性弹层，锚在被点的表头上 */
  const [prop, setProp] = useState<{ key: string; x: number; y: number } | null>(null);
  const [grounding, setGrounding] = useState(false);
  const [groundingHelpOpen, setGroundingHelpOpen] = useState(false);
  const [configMenu, setConfigMenu] = useState<"type" | "tool" | "inputs" | null>(null);
  const [columnOverrides, setColumnOverrides] = useState<Record<string, Partial<RecordsColumnMeta>>>({});
  const [inputSelections, setInputSelections] = useState<Record<string, string[]>>({});
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set());
  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);
  const [advancedSettings, setAdvancedSettings] = useState({ required: false, allowEmpty: true, confidence: false });
  /* + 新属性菜单 */
  const [addOpen, setAddOpen] = useState<{ x: number; y: number } | null>(null);
  const [tableMenuOpen, setTableMenuOpen] = useState<{ x: number; y: number } | null>(null);
  /* 程序化滚动（把新列滚进视野）不该把刚开的弹层关掉 */
  const ignoreScrollRef = useRef(false);

  const closeAll = () => {
    setProp(null);
    setConfigMenu(null);
    setGroundingHelpOpen(false);
    setMoreSettingsOpen(false);
    setAddOpen(null);
    setTableMenuOpen(null);
  };

  /**
   * 量下当前渲染宽度并切成「每列都是显式像素宽」。**只在真的要改宽度时才调**。
   *
   * 上游一挂载就锁死，因为它是整页 demo：容器宽度固定、一定可见。这张表是嵌在
   * 对话卡里的——挂载那一帧可能还没上屏（量到 0），容器宽度也可能小于各列宽度之和，
   * 一旦提前锁成像素宽就会把表格撑出横向滚动条。所以在没人拖之前保持
   * `width: 100%` + 类名档位宽，让浏览器自己分配；按下手柄的那一刻布局必然稳定，
   * 那时候量才是准的。
   */
  const lockWidths = (): Record<string, number> | null => {
    if (!tableRef.current) return null;
    if (columnWidthsLocked) return columnWidths;
    const headers = Array.from(tableRef.current.querySelectorAll<HTMLTableCellElement>("thead th"));
    if (headers.length !== columns.length + 1) return null;

    const measured: Record<string, number> = {};
    for (let index = 0; index < columns.length; index += 1) {
      const width = headers[index].getBoundingClientRect().width;
      // 量到 0 说明这一帧还没上屏。锁 0 会让每列塌成零宽、文字互相压在一起。
      if (width <= 0) return null;
      measured[columns[index].key] = width;
    }
    initialColumnWidthsRef.current = measured;
    setColumnWidths(measured);
    setActionColumnWidth(headers[headers.length - 1].getBoundingClientRect().width);
    setColumnWidthsLocked(true);
    return measured;
  };

  const widthOf = (column: RecordsColumn) =>
    columnWidths[column.key] ?? column.defaultWidth ?? NEW_COLUMN_WIDTH;

  const visibleRows = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const left = sortValueOf(a, sort.key);
      const right = sortValueOf(b, sort.key);
      const value =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return value * sort.dir;
    });
  }, [rows, sort]);

  /* 点别处关掉所有弹层 */
  useEffect(() => {
    if (!prop && !addOpen && !tableMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-recpop]")) closeAll();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [prop, addOpen, tableMenuOpen]);

  const openProp = (key: string) => (event: ReactMouseEvent) => {
    const th = (event.currentTarget as Element).closest("th");
    if (!th) return;
    setAddOpen(null);
    setTableMenuOpen(null);
    setConfigMenu(null);
    setGroundingHelpOpen(false);
    setMoreSettingsOpen(false);
    setProp((current) => {
      if (current?.key === key) return null;
      const rect = th.getBoundingClientRect();
      return { key, x: Math.min(rect.left, window.innerWidth - 336), y: rect.bottom + 6 };
    });
  };

  const isCalc = (key: string, index: number, rowId: string) => {
    if (!calculating || calculating.key !== key) return false;
    if (calculating.pendingIds) return calculating.pendingIds.includes(rowId);
    return calculating.resolved !== undefined && index >= calculating.resolved;
  };

  const allSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id));
  const partiallySelected = !allSelected && visibleRows.some((row) => selected.has(row.id));

  const commit = (next: Set<string>) => {
    setSelected(next);
    onSelectionChange?.([...next]);
  };
  const toggleSort = (key: string) =>
    setSort((current) =>
      current?.key === key ? { key, dir: (current.dir * -1) as 1 | -1 } : { key, dir: 1 },
    );
  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commit(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) visibleRows.forEach((row) => next.delete(row.id));
    else visibleRows.forEach((row) => next.add(row.id));
    commit(next);
  };

  const startColumnResize = (column: RecordsColumn) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    closeAll();

    const locked = lockWidths();
    const startX = event.clientX;
    const startWidth = locked?.[column.key] ?? widthOf(column);
    const minWidth = column.minWidth ?? 120;
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setResizingColumn(column.key);

    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => ({ ...current, [column.key]: width }));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      setResizingColumn(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const patchMeta = (key: string, patch: Partial<RecordsColumnMeta>) => {
    setColumnOverrides((current) => {
      const next = { ...current, [key]: { ...current[key], ...patch } };
      const base = columns.find((column) => column.key === key)?.meta ?? {};
      onColumnMetaChange?.(key, { ...base, ...next[key] });
      return next;
    });
  };

  const [first, ...rest] = columns;
  if (!first) return null;
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  const propColumn = prop ? columns.find((column) => column.key === prop.key) : undefined;
  const meta: RecordsColumnMeta | null = propColumn
    ? { ...propColumn.meta, ...columnOverrides[propColumn.key] }
    : null;
  /** 只有真由工具算出来的列才谈 grounding / 输入 / prompt；用户手填的列谈这些是噪音。 */
  const computed = !!meta && (meta.toolKind === "model" || meta.toolKind === "web");
  const selectedInputs = propColumn && meta ? inputSelections[propColumn.key] ?? meta.inputs ?? [] : [];
  const inputOptions = columns.filter((column) => column.key !== prop?.key).map((column) => column.label);
  const canAddColumn = !!onAddColumn;
  const addTypes = propertyTypes ?? DEFAULT_PROPERTY_TYPES;
  const tableWidth = columns.reduce((sum, column) => sum + widthOf(column), 0) + actionColumnWidth;
  /** 没锁宽时的表格下限：容器再窄也只让它滚，不许把列压扁。 */
  const minTableWidth =
    columns.reduce(
      (sum, column, index) =>
        sum +
        (columnWidths[column.key] ??
          column.defaultWidth ??
          (column.width ? NATURAL_WIDTH[column.width] : index === 0 ? FIRST_COLUMN_WIDTH : AUTO_COLUMN_WIDTH)),
      0,
    ) + ACTION_COLUMN_WIDTH;

  const glyphFor = (column: RecordsColumn) =>
    column.icon ?? (column.meta?.type ? <Icon size={15}>{RECORDS_TYPE_GLYPHS[column.meta.type]}</Icon> : null);

  return (
    <div className={`records-shell${fill ? " is-fill" : ""} ${className}`}>
      <div
        className="records-scroll"
        tabIndex={0}
        aria-label={ariaLabel}
        onScroll={() => {
          if (ignoreScrollRef.current) {
            ignoreScrollRef.current = false;
            return;
          }
          closeAll();
        }}
      >
        <table
          ref={tableRef}
          className="records-table"
          style={{ width: columnWidthsLocked ? tableWidth : "100%", minWidth: columnWidthsLocked ? tableWidth : minTableWidth }}
        >
          {/* 给了 `defaultWidth` 的列一律走内联宽度、不挂档位类名。
              `records-*-col` 那几个类是上游**整页尺度**的宽（270/275/190/210/175）；
              嵌在对话卡里时它们的和轻易超过容器，而 `table-layout: fixed` 会把没写死
              宽度的列压成 0——「岗位」和操作列就是这么消失的。调用方知道自己有多宽，
              让它说了算。 */}
          <colgroup>
            <col
              className={first.defaultWidth ? undefined : 'records-company-col'}
              style={
                columnWidthsLocked || first.defaultWidth
                  ? { width: widthOf(first) }
                  : undefined
              }
            />
            {rest.map((column) => (
              <col
                key={column.key}
                className={
                  !column.defaultWidth && column.width ? WIDTH_CLASS[column.width] : undefined
                }
                style={
                  columnWidthsLocked || column.defaultWidth
                    ? { width: widthOf(column) }
                    : undefined
                }
              />
            ))}
            {/* 操作列不写死宽度：没锁宽时让它吃掉剩余空间，才不会把表格顶出横向滚动条。 */}
            <col style={columnWidthsLocked ? { width: actionColumnWidth } : undefined} />
          </colgroup>
          <thead>
            <tr>
              <th className={`records-header-cell records-sticky-cell ${prop?.key === first.key ? "is-colsel" : ""}`}>
                <div className="records-company-header" style={{ cursor: "pointer" }} onClick={openProp(first.key)}>
                  {selectable && (
                    <Checkbox checked={allSelected} mixed={partiallySelected} onChange={toggleAll} label={labels.selectAll} />
                  )}
                  <span>{first.label}</span>
                </div>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={labels.resizeColumn.replace("{{label}}", first.label)}
                  className={`records-resize-handle ${resizingColumn === first.key ? "is-resizing" : ""}`}
                  onPointerDown={startColumnResize(first)}
                />
              </th>
              {rest.map((column) => (
                <th key={column.key} className={`records-header-cell ${prop?.key === column.key ? "is-colsel" : ""}`}>
                  {/* 点表头开属性配置；箭头才是排序 */}
                  <button type="button" className="records-header-button" onClick={openProp(column.key)}>
                    {glyphFor(column) && <span className="records-header-icon">{glyphFor(column)}</span>}
                    <span className="truncate">{column.label}</span>
                    {column.sortable && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={labels.sortBy.replace("{{label}}", column.label)}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSort(column.key);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleSort(column.key);
                          }
                        }}
                        className={`records-sort ${sort?.key === column.key ? "is-visible" : ""}`}
                        style={{ transform: sort?.key === column.key && sort.dir === -1 ? "rotate(180deg)" : undefined }}
                      >
                        <Icon size={12}><path d="M12 5v14M5 12l7 7 7-7" /></Icon>
                      </span>
                    )}
                  </button>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={labels.resizeColumn.replace("{{label}}", column.label)}
                    className={`records-resize-handle ${resizingColumn === column.key ? "is-resizing" : ""}`}
                    onPointerDown={startColumnResize(column)}
                  />
                </th>
              ))}
              <th className="records-header-cell">
                <div className="flex h-[35px] items-center gap-1 px-2">
                  {canAddColumn && (
                    <button
                      type="button"
                      aria-label={labels.newProperty}
                      data-recpop
                      onClick={(event) => {
                        setProp(null);
                        setTableMenuOpen(null);
                        const rect = event.currentTarget.getBoundingClientRect();
                        setAddOpen((current) => (current ? null : { x: Math.min(rect.left, window.innerWidth - 276), y: rect.bottom + 6 }));
                      }}
                      className="flex size-7 items-center justify-center rounded-[7px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink"
                    >
                      <Icon size={15} strokeWidth={2}><path d="M12 5v14M5 12h14" /></Icon>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={labels.tableOptions}
                    aria-expanded={!!tableMenuOpen}
                    data-recpop
                    onClick={(event) => {
                      setProp(null);
                      setAddOpen(null);
                      const rect = event.currentTarget.getBoundingClientRect();
                      setTableMenuOpen((current) => current ? null : {
                        x: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)),
                        y: rect.bottom + 6,
                      });
                    }}
                    className="flex size-7 items-center justify-center rounded-[7px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          {/* 数据格保持安静——逐行扫的时候那点纸感音效太吵 */}
          <tbody data-cuelume-silent>
            {visibleRows.map((row, index) => (
              <tr key={row.id} className={`records-row ${selected.has(row.id) ? "is-selected" : ""}`}>
                <td className={`records-cell records-sticky-cell records-company-cell ${prop?.key === first.key ? "is-colsel" : ""}`}>
                  {/* 行号只在开了选择时出：它和复选框是同一件事的两半——序号常驻、悬停换成
                      复选框。没有选择能力时给一列纯装饰的数字只是噪声。 */}
                  {selectable && <span className="records-rownum">{index + 1}</span>}
                  {selectable && (
                    <Checkbox checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} label={labels.selectRow} />
                  )}
                  {row.mark && <span className="records-company-mark">{row.mark}</span>}
                  {isCalc(first.key, index, row.id) ? (
                    <CalcCell label={labels.calculating} />
                  ) : row.href ? (
                    <a href={row.href} target="_blank" rel="noreferrer noopener" className="records-company-name has-link">
                      {row.cells[first.key]}
                    </a>
                  ) : (
                    <span className="records-company-name">{row.cells[first.key]}</span>
                  )}
                </td>
                {rest.map((column) => (
                  <td key={column.key} className={`records-cell ${prop?.key === column.key ? "is-colsel" : ""}`}>
                    {isCalc(column.key, index, row.id)
                      ? <CalcCell label={labels.calculating} />
                      : row.cells[column.key] ?? <span className="records-muted">—</span>}
                  </td>
                ))}
                <td className="records-cell" />
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="records-calculation-row">
                {footer}
                <td className="records-cell" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── 属性配置弹层 ───────────────────────────────────── */}
      {prop && propColumn && meta && (
        <div
          data-recpop
          className="fixed z-50 w-[320px] rounded-[14px] bg-surface px-3 pt-3 pb-1.5 shadow-overlay"
          style={{ top: prop.y, left: prop.x, animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" }}
        >
          <div className="pb-2 text-[13.5px] font-medium text-ink">{propColumn.label}</div>

          {meta.type && (
            <ConfigRow label={labels.type}>
              <button
                type="button"
                aria-haspopup={meta.editable ? "menu" : undefined}
                aria-expanded={meta.editable ? configMenu === "type" : undefined}
                disabled={!meta.editable}
                onClick={() => setConfigMenu((current) => current === "type" ? null : "type")}
                className="flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[13px] font-medium text-ink transition-colors duration-100 enabled:hover:bg-hover"
              >
                <span className="text-ink-2"><Icon size={14}>{RECORDS_TYPE_GLYPHS[meta.type] ?? RECORDS_TYPE_GLYPHS.Text}</Icon></span>
                {labels.types[meta.type] ?? meta.type}
                {meta.editable && <span className="text-ink-3"><Icon size={12} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></Icon></span>}
              </button>
              {meta.editable && configMenu === "type" && (
                <ConfigPicker
                  label={labels.propertyType}
                  selected={meta.type}
                  options={addTypes.map((type) => ({ value: type, label: labels.types[type] ?? type, icon: <Icon size={15}>{RECORDS_TYPE_GLYPHS[type]}</Icon> }))}
                  onSelect={(type) => {
                    patchMeta(prop.key, { type });
                    setConfigMenu(null);
                  }}
                />
              )}
            </ConfigRow>
          )}

          {meta.tool && (
            <ConfigRow label={labels.tool}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={configMenu === "tool"}
                disabled={!modelOptions}
                onClick={() => setConfigMenu((current) => current === "tool" ? null : "tool")}
                className="flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[13px] font-medium text-ink transition-colors duration-100 enabled:hover:bg-hover"
              >
                <span className={meta.toolKind === "model" ? "text-accent" : "text-ink-2"}>
                  {meta.toolKind === "model"
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>{TOOL_GLYPHS.model}</svg>
                    : <Icon size={14}>{TOOL_GLYPHS[meta.toolKind ?? "user"]}</Icon>}
                </span>
                {meta.tool}
                {modelOptions && <span className="text-ink-3"><Icon size={12} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></Icon></span>}
              </button>
              {configMenu === "tool" && modelOptions && (
                <ConfigPicker
                  label={labels.model}
                  selected={meta.tool}
                  options={modelOptions.map((model) => ({
                    value: model,
                    label: model,
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>{TOOL_GLYPHS.model}</svg>,
                  }))}
                  onSelect={(tool) => {
                    patchMeta(prop.key, { tool, toolKind: "model" });
                    setConfigMenu(null);
                  }}
                />
              )}
            </ConfigRow>
          )}

          {computed && (
            <ConfigRow label={labels.grounding}>
              <span className="flex items-center gap-2">
                <MiniSwitch label={labels.grounding} on={grounding} onToggle={() => setGrounding((current) => !current)} />
                <button
                  type="button"
                  aria-label={labels.aboutGrounding}
                  aria-expanded={groundingHelpOpen}
                  onClick={() => setGroundingHelpOpen((open) => !open)}
                  className="flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
                >
                  <Icon size={13}><g><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></g></Icon>
                </button>
              </span>
              {groundingHelpOpen && (
                <div className="absolute right-0 top-[30px] z-30 w-[230px] rounded-[10px] px-3 py-2.5 text-[12px] leading-relaxed shadow-overlay" style={{ color: "var(--tooltip-fg)", background: "var(--tooltip-bg)" }} role="status">
                  {labels.groundingHelp}
                </div>
              )}
            </ConfigRow>
          )}

          {computed && (
            <ConfigRow label={labels.inputs}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={configMenu === "inputs"}
                onClick={() => setConfigMenu((current) => current === "inputs" ? null : "inputs")}
                className="flex max-w-[220px] items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[13px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                {selectedInputs.length ? (
                  <span className="flex min-w-0 items-center gap-1">
                    {selectedInputs.slice(0, 2).map((input) => (
                      <span key={input} className="max-w-[92px] truncate rounded-[5px] bg-accent-tint px-1.5 py-0.5 text-[12px] font-medium text-accent-ink">{input}</span>
                    ))}
                    {selectedInputs.length > 2 && <span className="text-[11px] font-medium text-ink-3">+{selectedInputs.length - 2}</span>}
                  </span>
                ) : (
                  <span>{labels.selectInputs}</span>
                )}
                <span className="shrink-0 text-ink-3"><Icon size={12} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></Icon></span>
              </button>
              {configMenu === "inputs" && (
                <InputPicker
                  title={labels.useValuesFrom}
                  selected={selectedInputs}
                  options={inputOptions}
                  onToggle={(input) => {
                    setInputSelections((current) => {
                      const existing = current[prop.key] ?? meta.inputs ?? [];
                      const next = existing.includes(input) ? existing.filter((item) => item !== input) : [...existing, input];
                      return { ...current, [prop.key]: next };
                    });
                  }}
                />
              )}
            </ConfigRow>
          )}

          {/* prompt —— @ 提及以 chip 内联在正文里 */}
          {computed && (
            <div
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label={labels.prompt.replace("{{label}}", propColumn.label)}
              aria-multiline="true"
              spellCheck
              className="mt-2 min-h-[88px] cursor-text rounded-[10px] bg-inset p-3 text-[13px] leading-relaxed shadow-hairline outline-none transition-[box-shadow] duration-150 focus:shadow-[0_0_0_2px_var(--accent)]"
            >
              {meta.prompt ? (
                <span className="text-ink">
                  {meta.prompt.before}
                  {meta.prompt.chip && <span contentEditable={false} className="rounded-[5px] bg-accent-tint px-1.5 py-0.5 text-[12px] font-medium text-accent-ink">{meta.prompt.chip}</span>}
                  {meta.prompt.after}
                </span>
              ) : (
                <span className="text-ink-3">{labels.promptPlaceholder}</span>
              )}
            </div>
          )}

          {computed && onCalculate && (
            <button
              type="button"
              disabled={!!calculating}
              onClick={() => {
                onCalculate(prop.key);
                setProp(null);
              }}
              className="mt-2.5 flex h-9 w-full items-center justify-center gap-2 rounded-[9px] text-[12.5px] font-medium text-ink shadow-btn transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.98] disabled:opacity-60"
            >
              <Icon size={14} strokeWidth={1.9}><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></Icon>
              {labels.goCalculate}
            </button>
          )}

          <GlideMenu className="mt-3 flex flex-col gap-0.5 border-t border-line pt-2" highlightClassName="-inset-x-1.5 rounded-[8px] bg-hover">
            <button
              data-menu-row
              type="button"
              aria-pressed={pinnedColumns.has(prop.key)}
              onClick={() => setPinnedColumns((current) => {
                const next = new Set(current);
                if (next.has(prop.key)) next.delete(prop.key);
                else next.add(prop.key);
                return next;
              })}
              className="relative z-10 -mx-1.5 flex h-8 items-center gap-2.5 rounded-[8px] px-1.5 text-left text-[13px] leading-none text-ink transition-transform duration-150 active:scale-[0.96]"
            >
              <span className={pinnedColumns.has(prop.key) ? "text-accent" : "text-ink-2"}><Icon size={15}><path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3-1-7z" /></Icon></span>
              {pinnedColumns.has(prop.key) ? labels.unpin : labels.pin}
            </button>
            <button
              data-menu-row
              type="button"
              aria-expanded={moreSettingsOpen}
              onClick={() => setMoreSettingsOpen((open) => !open)}
              className="relative z-10 -mx-1.5 flex h-8 items-center gap-2.5 rounded-[8px] px-1.5 text-left text-[13px] leading-none text-ink transition-transform duration-150 active:scale-[0.96]"
            >
              <span className={moreSettingsOpen ? "text-ink" : "text-ink-2"}><Icon size={15}><g><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></g></Icon></span>
              <span className="flex-1">{labels.moreSettings}</span>
              <span className={`text-ink-3 transition-transform duration-150 ${moreSettingsOpen ? "rotate-90" : ""}`}><Icon size={12} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></Icon></span>
            </button>
            {onHideColumn && (
              <button
                data-menu-row
                type="button"
                onClick={() => {
                  onHideColumn(prop.key);
                  setProp(null);
                }}
                className="relative z-10 -mx-1.5 flex h-8 items-center gap-2.5 rounded-[8px] px-1.5 text-left text-[13px] leading-none text-ink transition-transform duration-150 active:scale-[0.96]"
              >
                <span className="text-ink-2"><Icon size={15}><g><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c7 0 10 7 10 7a16.3 16.3 0 0 1-2.1 3M6.6 6.6A16 16 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M3 3l18 18" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></g></Icon></span>
                {labels.hideFromView}
              </button>
            )}
          </GlideMenu>

          {moreSettingsOpen && (
            <div className="mt-2 border-t border-line pt-2" style={{ animation: "fade-up 160ms cubic-bezier(0.23,1,0.32,1) both" }}>
              <div className="pb-1 text-[11.5px] font-medium text-ink-3">{labels.behavior}</div>
              <ConfigRow label={labels.requiredValue}>
                <MiniSwitch label={labels.requiredValue} on={advancedSettings.required} onToggle={() => setAdvancedSettings((current) => ({ ...current, required: !current.required }))} />
              </ConfigRow>
              <ConfigRow label={labels.allowEmpty}>
                <MiniSwitch label={labels.allowEmpty} on={advancedSettings.allowEmpty} onToggle={() => setAdvancedSettings((current) => ({ ...current, allowEmpty: !current.allowEmpty }))} />
              </ConfigRow>
              <ConfigRow label={labels.showConfidence}>
                <MiniSwitch label={labels.showConfidence} on={advancedSettings.confidence} onToggle={() => setAdvancedSettings((current) => ({ ...current, confidence: !current.confidence }))} />
              </ConfigRow>
            </div>
          )}
        </div>
      )}

      {/* ── 新属性类型菜单 ─────────────────────────────────── */}
      {addOpen && canAddColumn && (
        <div
          data-recpop
          className="fixed z-50 w-[260px] rounded-[14px] bg-surface p-1.5 shadow-overlay"
          style={{ top: addOpen.y, left: addOpen.x, animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" }}
        >
          <div className="px-2 pb-1 pt-1 text-[12px] font-medium text-ink-3">{labels.newProperty}</div>
          <GlideMenu className="flex flex-col gap-px">
            {addTypes.map((type) => (
              <button
                key={type}
                data-menu-row
                type="button"
                onClick={() => {
                  setAddOpen(null);
                  onAddColumn?.(type);
                }}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink"
              >
                <span className="text-ink-2"><Icon size={15}>{RECORDS_TYPE_GLYPHS[type]}</Icon></span>
                {labels.types[type] ?? type}
              </button>
            ))}
          </GlideMenu>
        </div>
      )}

      {/* ── 表格选项菜单 ───────────────────────────────────── */}
      {tableMenuOpen && (
        <div
          data-recpop
          className="fixed z-50 w-[220px] rounded-[14px] bg-surface p-1.5 shadow-overlay"
          style={{ top: tableMenuOpen.y, left: tableMenuOpen.x, animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top right" }}
        >
          <div className="px-2 pb-1 pt-1 text-[12px] font-medium text-ink-3">{labels.tableOptions}</div>
          <GlideMenu className="flex flex-col gap-px">
            {canAddColumn && (
              <button
                data-menu-row
                type="button"
                onClick={() => {
                  const position = tableMenuOpen;
                  setTableMenuOpen(null);
                  setAddOpen({ x: Math.min(position.x, window.innerWidth - 276), y: position.y });
                }}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink"
              >
                <span className="text-ink-2"><Icon size={15} strokeWidth={2}><path d="M12 5v14M5 12h14" /></Icon></span>
                {labels.addProperty}
              </button>
            )}
            <button
              data-menu-row
              type="button"
              onClick={() => {
                // 紧凑 = 在当前宽度上按比例收，不是拍一组魔数：列数和列名长度都由调用方决定。
                const base = lockWidths();
                if (base) {
                  const next: Record<string, number> = {};
                  columns.forEach((column) => {
                    next[column.key] = Math.max(
                      column.minWidth ?? 120,
                      Math.round((base[column.key] ?? widthOf(column)) * 0.8),
                    );
                  });
                  setColumnWidths(next);
                }
                setTableMenuOpen(null);
              }}
              className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink"
            >
              <span className="text-ink-2"><Icon size={15}><path d="M4 8h16M7 4 3 8l4 4M17 4l4 4-4 4M4 16h16" /></Icon></span>
              {labels.compactColumns}
            </button>
            <button
              data-menu-row
              type="button"
              onClick={() => {
                setColumnWidths({ ...(initialColumnWidthsRef.current ?? {}) });
                setTableMenuOpen(null);
              }}
              className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink"
            >
              <span className="text-ink-2"><Icon size={15}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v6h6" /></Icon></span>
              {labels.resetColumnWidths}
            </button>
            {selectable && (
              <>
                <div className="my-1 h-px bg-line" />
                <button
                  data-menu-row
                  type="button"
                  onClick={() => {
                    commit(new Set());
                    setTableMenuOpen(null);
                  }}
                  className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink"
                >
                  <span className="text-ink-2"><Icon size={15}><path d="M5 5l14 14M19 5 5 19" /></Icon></span>
                  {labels.clearSelection}
                </button>
              </>
            )}
          </GlideMenu>
        </div>
      )}
    </div>
  );
}
