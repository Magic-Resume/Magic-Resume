'use client';

import React, { useMemo, useState } from 'react';
import { BriefcaseBusiness, ExternalLink } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { WidgetShell } from '@magic-resume/genui';
import { RecordsTable } from '@magic-resume/genui/beautiful';
import type {
  RecordsRow,
} from '@magic-resume/genui/beautiful';
import type { WidgetProps } from '@magic-resume/genui/contract';

export const APPLICATION_STATUSES = [
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface ApplicationTrackerItem {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  sourceUrl?: string;
  location?: string;
  notes?: string;
  appliedAt?: string;
  nextActionAt?: string;
  updatedAt?: string;
  /** 自定义列的取值。`computed: false` = 还没算过，那一格显示「计算中」。 */
  fields?: Record<string, { value: string; computed: boolean }>;
}

export interface ApplicationTrackerColumn {
  key: string;
  /** 内置列的显示名走 i18n；自定义列用 `label`。 */
  builtin: boolean;
  label: string;
  type: string;
  source: 'user' | 'ai';
  prompt?: string;
}

/** 后端没给列时的兜底，和 `DEFAULT_BOARD_COLUMNS` 一致。 */
const DEFAULT_COLUMNS: ApplicationTrackerColumn[] = (
  ['company', 'role', 'appliedAt', 'status', 'sourceUrl'] as const
).map((key) => ({
  key,
  builtin: true,
  label: '',
  type: 'Text',
  source: 'user' as const,
}));

/**
 * 「新属性」菜单和类型下拉里可选的类型。
 *
 * 上游那份有 File / Collection / Reference / JSON / File splitter——那是空壳 demo
 * 的道具，一条投递记录里没有任何东西对得上，选了也没有地方能存。
 */
const TRACKER_PROPERTY_TYPES = ['Text', 'Date', 'Single select', 'Multi select', 'URL'];

/**
 * 内置列的属性类型与**卡片尺度**的列宽。
 *
 * 宽度写成像素而不是用 `width` 档位：那几个档位（`records-*-col`）是上游整页尺度的
 * 270/190/175，五列加起来超过一千像素，而这张卡在对话里只有 ~575px。
 * `table-layout: fixed` 遇到「固定宽之和 > 容器」会把没写死宽度的列直接压成 0——
 * 「岗位」和操作列就是这么整列消失的。
 */
const BUILTIN_COLUMN_SHAPE: Record<
  string,
  { type: string; width: number }
> = {
  company: { type: 'Text', width: 150 },
  role: { type: 'Text', width: 130 },
  status: { type: 'Single select', width: 96 },
  appliedAt: { type: 'Date', width: 92 },
  nextActionAt: { type: 'Date', width: 92 },
  sourceUrl: { type: 'URL', width: 76 },
  location: { type: 'Text', width: 110 },
  notes: { type: 'Text', width: 180 },
};

const STATUS_DOTS: Record<ApplicationStatus, string> = {
  SAVED: '#94a3b8',
  APPLIED: '#38bdf8',
  SCREENING: '#22d3ee',
  INTERVIEW: '#a78bfa',
  OFFER: '#34d399',
  ACCEPTED: '#10b981',
  REJECTED: '#fb7185',
  WITHDRAWN: '#94a3b8',
};

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  SAVED: 'bg-sunk text-muted',
  APPLIED: 'bg-tint-sky text-ink-sky',
  SCREENING: 'bg-tint-sky text-ink-sky',
  INTERVIEW: 'bg-orange-tint text-orange',
  OFFER: 'bg-green-tint text-green',
  ACCEPTED: 'bg-green-tint text-green',
  REJECTED: 'bg-red-tint text-red',
  WITHDRAWN: 'bg-sunk text-muted',
};

/**
 * 投递列表用 Beautiful UI 的 Records Table：粘性首列 + 排序 + 页脚统计。
 *
 * 筛选 chips 留在这一层自己渲染，没有跟着表格一起换掉——它既是统计也是即时筛选，
 * 是这张卡最好用的部分，而 `RecordsTable` 里没有这个概念。
 */
export default function ApplicationTrackerCard({ instance, onAction }: WidgetProps) {
  const { t, i18n } = useTranslation();
  const props = instance.props as {
    applications?: ApplicationTrackerItem[];
    columns?: ApplicationTrackerColumn[];
  };
  const applications = props.applications ?? [];
  /**
   * `builtin` **自己推**，不信后端回的那个字段。
   *
   * 两个后端（agent 的 `track_application` 工具、platform-api 的只读面板）都从没回过
   * 这个字段，于是它一直是 `undefined`——`labelOf` 因此走 `column.label`，而内置列的
   * label 是空串（后端注释写着「显示名归前端」），结果就是列头只剩一个图标。
   *
   * 只在用户存过列配置之后才犯：没存过时走下面那份 `DEFAULT_COLUMNS` 兜底，那里
   * `builtin` 是写死的 true。所以这个坑安静地活了很久。
   *
   * 「哪些键是内置的」这件事前端本来就有一份权威表（`BUILTIN_COLUMN_SHAPE`），
   * 从它推导比维护一个跨仓字段少一个会坏的约定。
   */
  const boardColumns = (
    props.columns?.length ? props.columns : DEFAULT_COLUMNS
  ).map((column) => ({ ...column, builtin: column.key in BUILTIN_COLUMN_SHAPE }));

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: '2-digit',
      }),
    [i18n.language],
  );

  const [filter, setFilter] = useState<'all' | ApplicationStatus>('all');

  /**
   * 表头属性弹层的文案。
   *
   * `types` 的键必须留英文——它同时是 `RECORDS_TYPE_GLYPHS` 的查表键，翻译了就丢图标。
   */
  const tableLabels = useMemo(() => {
    const table = (key: string) => t(`aiLab.widgets.applicationTracker.table.${key}`);
    return {
      selectAll: table('selectAll'),
      selectRow: table('selectRow'),
      sortBy: table('sortBy'),
      resizeColumn: table('resizeColumn'),
      tableOptions: table('tableOptions'),
      compactColumns: table('compactColumns'),
      resetColumnWidths: table('resetColumnWidths'),
      clearSelection: table('clearSelection'),
      type: table('type'),
      propertyType: table('propertyType'),
      tool: table('tool'),
      pin: table('pin'),
      unpin: table('unpin'),
      moreSettings: table('moreSettings'),
      behavior: table('behavior'),
      requiredValue: table('requiredValue'),
      allowEmpty: table('allowEmpty'),
      showConfidence: table('showConfidence'),
      types: Object.fromEntries(
        TRACKER_PROPERTY_TYPES.map((type) => [type, table(`types.${type}`)]),
      ) as Record<string, string>,
    };
  }, [t]);

  const counts = new Map<ApplicationStatus, number>();
  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }

  const filters: { key: 'all' | ApplicationStatus; label: string; dot?: string; count: number }[] = [
    {
      key: 'all',
      label: t('aiLab.widgets.applicationTracker.filters.all'),
      count: applications.length,
    },
    ...APPLICATION_STATUSES.filter((status) => counts.has(status)).map(
      (status) => ({
        key: status,
        label: t(`aiLab.widgets.applicationTracker.status.${status}`),
        dot: STATUS_DOTS[status],
        count: counts.get(status) ?? 0,
      }),
    ),
  ];

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
  };

  const visible = applications.filter(
    (application) => filter === 'all' || application.status === filter,
  );

  const labelOf = (column: ApplicationTrackerColumn) =>
    column.builtin
      ? t(`aiLab.widgets.applicationTracker.columns.${column.key}`)
      : column.label;

  /**
   * 表头属性弹层的元数据。
   *
   * 内置列是 `toolKind: 'user'` —— 它们的值确实全是手填 / agent 按用户说的记的。
   * 自定义的 ai 列才有 grounding、输入、prompt 和「开始计算」：那几样只有真存在计算
   * 通道时才该出现，摆着好看等于界面在说谎。
   */
  const metaOf = (column: ApplicationTrackerColumn) =>
    column.source === 'ai'
      ? {
          type: column.type,
          tool: t('aiLab.widgets.applicationTracker.table.aiComputed'),
          toolKind: 'model' as const,
          editable: true,
          ...(column.prompt ? { prompt: { before: column.prompt } } : {}),
        }
      : {
          type: column.builtin
            ? BUILTIN_COLUMN_SHAPE[column.key]?.type ?? 'Text'
            : column.type,
          tool: t('aiLab.widgets.applicationTracker.table.userInput'),
          toolKind: 'user' as const,
          // 内置列的类型是内在的：「状态」就是单选，改成别的不对应任何东西。
          editable: !column.builtin,
        };

  const columns = boardColumns.map((column, index) => ({
    key: column.key,
    label: labelOf(column),
    defaultWidth: column.builtin
      ? BUILTIN_COLUMN_SHAPE[column.key]?.width ?? 130
      : 130,
    // 首列是主键列，压到看不清公司名就没意义了。
    minWidth: index === 0 ? 120 : 72,
    sortable: column.builtin,
    meta: metaOf(column),
  }));

  /** 这一格渲染什么。内置列读记录本身的字段，自定义列读 `fields`。 */
  const cellOf = (
    application: ApplicationTrackerItem,
    column: ApplicationTrackerColumn,
  ): React.ReactNode => {
    if (!column.builtin) {
      const field = application.fields?.[column.key];
      // 还没算过的格子交给 RecordsTable 画脉冲（见下面的 calculating），这里不占位。
      if (!field?.computed) return undefined;
      return field.value ? (
        <span className="truncate text-secondary">{field.value}</span>
      ) : (
        <span className="records-muted">—</span>
      );
    }
    switch (column.key) {
      case 'company':
        return <span className="truncate font-medium text-primary">{application.company}</span>;
      case 'role':
        return <span className="truncate text-secondary">{application.role}</span>;
      case 'status':
        return (
          <span
            className={`inline-flex h-5 items-center rounded-[5px] px-1.5 text-[11px] font-medium ${STATUS_CLASSES[application.status]}`}
          >
            {t(`aiLab.widgets.applicationTracker.status.${application.status}`)}
          </span>
        );
      case 'appliedAt':
        return formatDate(application.appliedAt);
      case 'nextActionAt':
        return formatDate(application.nextActionAt);
      case 'location':
        return application.location ?? <span className="records-muted">—</span>;
      case 'notes':
        return application.notes ? (
          <span className="truncate text-secondary" title={application.notes}>
            {application.notes}
          </span>
        ) : (
          <span className="records-muted">—</span>
        );
      case 'sourceUrl':
        return application.sourceUrl ? (
          <a
            href={application.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="records-link"
            title={application.sourceUrl}
          >
            {t('aiLab.widgets.applicationTracker.source')}
            <ExternalLink size={10} aria-hidden />
          </a>
        ) : (
          <span className="records-muted">—</span>
        );
      default:
        return undefined;
    }
  };

  const sortValueOf = (
    application: ApplicationTrackerItem,
    column: ApplicationTrackerColumn,
  ): string | number => {
    switch (column.key) {
      case 'status':
        return APPLICATION_STATUSES.indexOf(application.status);
      case 'appliedAt':
      case 'nextActionAt': {
        const raw = application[column.key];
        return raw ? new Date(raw).getTime() || 0 : 0;
      }
      default:
        return (application[column.key as 'company'] as string) ?? '';
    }
  };

  const rows: RecordsRow[] = visible.map((application) => ({
    id: application.id,
    // 首列的方形字母标：一眼扫下来公司名的首字比整行文字更容易定位。
    mark: (application.company || application.role || '?').slice(0, 1).toUpperCase(),
    // 排序值与渲染内容分开：日期那一列渲染的是「Dec 03」，排序要按真实时间戳。
    sortValues: Object.fromEntries(
      boardColumns
        .filter((column) => column.builtin)
        .map((column) => [column.key, sortValueOf(application, column)]),
    ),
    cells: Object.fromEntries(
      boardColumns.map((column) => [column.key, cellOf(application, column)]),
    ),
  }));

  /**
   * 正在算的那一列。
   *
   * 这不是动效：`resolved` 是**真实**已落库的格子数，由后端 `computedAt` 决定。
   * 模型每写一格就重推一次面板，进度跟着往前走；模型半途停了，进度也就停在那里
   * ——那正是事实。
   */
  const pendingColumn = boardColumns.find(
    (column) =>
      column.source === 'ai' &&
      visible.some((application) => !application.fields?.[column.key]?.computed),
  );
  const calculating = pendingColumn
    ? {
        key: pendingColumn.key,
        resolved: visible.filter(
          (application) => application.fields?.[pendingColumn.key]?.computed,
        ).length,
      }
    : null;

  /** 这一列的页脚统计。算不出有意义的数就留破折号，不硬凑一个。 */
  const footerOf = (column: ApplicationTrackerColumn): string => {
    if (column.key === 'status') {
      return t('aiLab.widgets.applicationTracker.footer.applied', {
        count: visible.filter((item) => item.status !== 'SAVED').length,
      });
    }
    if (column.key === 'sourceUrl') {
      return t('aiLab.widgets.applicationTracker.footer.links', {
        count: visible.filter((item) => item.sourceUrl).length,
      });
    }
    if (!column.builtin) {
      return t('aiLab.widgets.applicationTracker.footer.filled', {
        count: visible.filter((item) => item.fields?.[column.key]?.value).length,
      });
    }
    return '—';
  };

  /**
   * 加列 / 算列 / 隐藏列都变成一句用户消息交给 agent。
   *
   * 这是**真通道**，不是本地状态：agent 收到后调 `track_application` 的
   * `add_column` / `set_field` / `remove_column`，写进库再把面板推回来。所以
   * 界面上看到的每一格都对应库里一行，没有一格是前端自己变出来的。
   */
  const sendToAgent = (text: string) => onAction({ type: 'submit', values: { text } });
  const handleAddColumn = (type: string) =>
    sendToAgent(
      t('aiLab.widgets.applicationTracker.actions.addColumn', {
        type: tableLabels.types[type] ?? type,
      }),
    );
  const handleCalculate = (key: string) => {
    const column = boardColumns.find((entry) => entry.key === key);
    if (!column) return;
    sendToAgent(
      t('aiLab.widgets.applicationTracker.actions.calculate', {
        column: labelOf(column),
      }),
    );
  };
  const handleHideColumn = (key: string) => {
    const column = boardColumns.find((entry) => entry.key === key);
    if (!column) return;
    sendToAgent(
      t('aiLab.widgets.applicationTracker.actions.hideColumn', {
        column: labelOf(column),
      }),
    );
  };

  const emptyState = (
    <div
      role="status"
      className="flex min-h-24 items-center gap-3 rounded-card bg-surface px-4 shadow-card"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sunk ring-1 ring-inset ring-line">
        <BriefcaseBusiness size={15} className="text-muted" />
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-primary">
          {t('aiLab.widgets.applicationTracker.emptyTitle')}
        </p>
        <p className="mt-0.5 max-w-[42ch] text-[11px] leading-relaxed text-muted">
          {t('aiLab.widgets.applicationTracker.emptyDescription')}
        </p>
      </div>
    </div>
  );

  return (
    // `surface={false}`：`beautiful/*` 自带 `rounded-card bg-surface shadow-card`，
    // 再套一层默认外壳就是卡中卡。标题行也去掉——表格自己已经说清楚这是什么了。
    <WidgetShell density="block" width="wide" surface={false}>
      {applications.length ? (
        <>
          {/* 筛选 chips：既是统计也是筛选。RecordsTable 里没有这个概念，所以留在这一层。 */}
          <div className="-mx-1 mb-1.5 flex items-center gap-1 overflow-x-auto px-1 py-1" style={{ scrollbarWidth: 'none' }}>
            {filters.map((entry) => {
              const active = filter === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(entry.key)}
                  /* 类名与 beautiful-ui 的 FilterTable 逐字一致，不要换成本仓的别名——
                     `bg-raised`/`bg-sunk` 虽然指向同一批变量，但改写过一次就再难对回去。 */
                  className={`flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-[background-color,box-shadow,color] duration-200 ${
                    active ? 'bg-surface text-ink shadow-btn' : 'text-ink-2 hover:bg-hover'
                  }`}
                >
                  {entry.dot && <span className="size-1.5 rounded-full" style={{ background: entry.dot }} />}
                  {entry.label}
                  {/* 计数就是个数字，不加任何底色。原来照搬了 `bg-field`，而本仓它指向
                      `--surface-sunk`（暗色下接近纯黑），于是数字被裱进一个黑块里。
                      层级用字色区分就够：选中态稍亮，未选中更淡。 */}
                  <span
                    className={`text-[10.5px] tabular-nums ${active ? 'text-ink-2' : 'text-ink-3'}`}
                  >
                    {entry.count}
                  </span>
                </button>
              );
            })}
          </div>
          <RecordsTable
            ariaLabel={t('aiLab.widgets.applicationTracker.ariaLabel')}
            selectable
            labels={tableLabels}
            columns={columns}
            rows={rows}
            emptyState={emptyState}
            calculating={calculating}
            /* 类型收到对投递面板有意义的四种。上游那份（File / Collection /
               File splitter / Reference / JSON）是空壳 demo 的道具，一条投递记录
               里没有任何东西对得上它们。 */
            propertyTypes={TRACKER_PROPERTY_TYPES}
            onAddColumn={handleAddColumn}
            onCalculate={handleCalculate}
            onHideColumn={handleHideColumn}
            /* 页脚统计条：按筛选后的可见集算，不是总集——chips 一切，脚注跟着变，
               否则「已投递 3」配着一张只有 1 行的表，读起来是两个互相矛盾的数。 */
            footer={boardColumns.map((column, index) => (
              <td
                key={column.key}
                className={`records-cell${index === 0 ? ' records-sticky-cell' : ''}`}
              >
                {index === 0 ? (
                  <span className="records-footer-value records-calculation-label">
                    <span className="records-calculation-number">{visible.length}</span>
                    {t('aiLab.widgets.applicationTracker.footer.count')}
                  </span>
                ) : (
                  <span className="records-footer-value records-muted">
                    {footerOf(column)}
                  </span>
                )}
              </td>
            ))}
          />
        </>
      ) : (
        emptyState
      )}
    </WidgetShell>
  );
}
