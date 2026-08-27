import React from 'react';

/**
 * 工具与芯片的图标集。
 *
 * **一律手写 SVG，不用 emoji**：emoji 的字形由系统字体决定，同一个码点在 macOS /
 * Windows / Android 上是三种画风、三种粗细、三种基线——放进一行 12px 的芯片里，它会
 * 比旁边的文字大一圈且对不齐，还带着自己的颜色，跟主题令牌完全无关。
 *
 * 全部 24×24 viewBox、`stroke="currentColor"`，所以颜色跟着上下文走（完成态褪色、
 * 深浅色主题切换都不用额外处理）。
 */

/** Core 的 `TodoChipKind` + 工具追踪用到的动作类别。 */
export type IconKey =
  | 'read'
  | 'write'
  | 'edit'
  | 'analyze'
  | 'search'
  | 'ask'
  | 'tool'
  | 'think'
  | 'run'
  | 'translate'
  | 'attach'
  | 'copy'
  | 'retry'
  // 以下这批是为了**不再共用一把扳手**而补的。此前 write_todos / task /
  // track_application / execute 全都退成 `tool`，一屏工具行看上去像同一件事重复了四遍。
  | 'plan'
  | 'delegate'
  | 'track'
  | 'interview'
  | 'design'
  | 'logo'
  | 'verify'
  | 'card'
  | 'archive';

const PATHS: Record<IconKey, React.ReactNode> = {
  /** 文档 —— 读取简历 / 读文件 */
  read: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  /** 钢笔 —— 写入 / 重写 */
  write: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  /** 带方框的笔 —— 就地修改（与「新写一份」区分） */
  edit: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </>
  ),
  /** 柱状图 —— 分析 / 评估打分 */
  analyze: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15v3M12 9v9M17 5v13" />
    </>
  ),
  /** 放大镜 —— 检索 */
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  /** 对话气泡 —— 需要用户回答 */
  ask: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  /** 扳手 —— 通用工具，认不出类别时的兜底 */
  tool: <path d="M14.7 6.3a4 4 0 0 1-5 5L4 17v3h3l5.7-5.7a4 4 0 0 1 5-5l2.3-2.3-2.3-2.3z" />,
  /** 四角星 —— 思考（与 Beautiful UI 的 header 图元同形） */
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" fill="currentColor" stroke="none" />,
  /** 终端箭头 —— 执行 */
  run: <path d="M4 17l6-5-6-5M12 19h8" />,
  /** 双向箭头 —— 翻译 */
  translate: (
    <>
      <path d="M4 5h10M9 3v2c0 4-2.5 7-5 8" />
      <path d="M8 11c1.5 2 4 3.5 6 4" />
      <path d="M14 21l4-9 4 9M15.5 18h5" />
    </>
  ),
  /** 双方框 —— 复制 */
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  /** 转一圈的箭头 —— 重新生成（与 Beautiful UI 操作行里的那枚同形） */
  retry: <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />,
  /** 回形针 —— 附件 */
  attach: (
    <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 1 1 5.18 5.18l-9.2 9.19a1.83 1.83 0 1 1-2.59-2.59l8.49-8.48" />
  ),
  /** 勾选清单 —— 列计划（write_todos） */
  plan: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 10M4 18l1.2 1.2L7.5 16" />
    </>
  ),
  /** 分叉 —— 交给子代理（task） */
  delegate: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M6 8.5v7M8.5 6H14a2 2 0 0 1 2 2v7.5" />
    </>
  ),
  /** 看板列 —— 投递面板（track_application） */
  track: (
    <>
      <rect x="3" y="4" width="6" height="16" rx="1.5" />
      <rect x="13" y="4" width="6" height="10" rx="1.5" />
    </>
  ),
  /** 麦克风 —— 模拟面试 */
  interview: (
    <>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </>
  ),
  /** 版面框 —— 模板复刻 */
  design: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 9v12" />
    </>
  ),
  /** 图片 —— 取公司图标 */
  logo: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  /** 盾牌加勾 —— 反捏造核验（check_resume_evidence） */
  verify: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 11.5 2 2 4-4" />
    </>
  ),
  /** 卡片 —— 推送 GenUI 卡（push_ui） */
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 14.5h5" />
    </>
  ),
  /** 归档箱 —— 资产库 */
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5" />
      <path d="M10 12.5h4" />
    </>
  ),
};

export function isIconKey(value: unknown): value is IconKey {
  return typeof value === 'string' && value in PATHS;
}

/**
 * 一个图标。`size` 默认 14，正好压在 12.5px 正文的视觉重心上。
 *
 * 认不出的 key 落到 `tool` 而不是渲染空白——一行芯片里缺一个图标，会让它比邻行矮一截。
 */
export function Icon({
  name,
  size = 14,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const key: IconKey = isIconKey(name) ? name : 'tool';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[key]}
    </svg>
  );
}
