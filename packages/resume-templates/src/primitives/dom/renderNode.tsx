import React from 'react';
import { WysiwygContent } from '../../templateLayout/WysiwygContent';
import {
  Editable,
  SectionHandle,
  SectionInsertSlot,
  type EditableTarget,
} from '../../renderer/EditableCanvas';
import { sectionIconByName } from '../../sectionIcons';
import { listIndent, markerFor } from '../listMarkers';
import { withRoleStyle } from '../roleStyles';
import type { ResolvedNode, ResolvedStyle, ResolvedText } from '../types';

/**
 * DOM 后端：Resolved IR → HTML。
 *
 * **它不理解业务。** 不读简历、不执行 `each` / `when`、不猜字段、不做 URL 安全化——
 * 那些在编译器里全做完了。这里只把已经解析好的树画出来。
 *
 * 这不是洁癖：双后端漂移**从架构上消除**的前提就是「语义只有一份」。此前
 * `summary` / `awards` 在导出时静默消失，正是因为两个渲染器各存了一份判断逻辑。
 */

const EDGE_WIDTHS = [
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
] as const;

/**
 * IR 的样式键与 CSS 同名，直接当 style 用；数值补 px 交给 React。
 *
 * **只有一处必须归一化：逐边 border。**
 *
 * IR 里写 `{ borderBottomWidth: 1, borderStyle: 'solid' }` 的意思毫无歧义——只要下边线。
 * 但 CSS 不是这么读的：`border-style: solid` 一开，四条边全部生效，而未指定的三边
 * 取默认宽度 `medium`（约 3px）。于是「小节标题下面一条细线」渲成了**一个粗黑框**。
 *
 * react-pdf 没有这个层叠规则，未指定的边宽度就是 0。所以不归一化的话，同一棵 IR
 * 在两个后端上长得完全不同——而这类差异语义一致性测试也抓不到（它比的是文本与
 * 字号/字重/颜色，不比边框）。归一化收口在这里：任何一边被指定了，其余边显式补 0。
 */
const toCss = (style: ResolvedStyle): React.CSSProperties => {
  const raw = style as Record<string, unknown>;
  const specified = EDGE_WIDTHS.filter((k) => raw[k] !== undefined);
  if (specified.length === 0 || specified.length === EDGE_WIDTHS.length) {
    return style as React.CSSProperties;
  }
  const zeroed = Object.fromEntries(
    EDGE_WIDTHS.filter((k) => raw[k] === undefined).map((k) => [k, 0]),
  );
  return { ...zeroed, ...raw } as React.CSSProperties;
};

/**
 * IR 的编辑锚点 → `EditableCanvas` 的 target。
 *
 * 两处不一样，必须显式转换而不是硬转类型：
 * - `kind`：IR 用 `richText`，画布用 `html`
 * - `itemId`：IR 里可缺省（表头字段），画布要求是 string；表头走 `info` 哨兵，
 *   `pathOf` 那边根本不读 itemId，给空串即可
 *
 * `Editable` 自己会挂 `data-resume-path`、悬停手柄、评审卡——**不要在外面再手写一份**，
 * 那会变成两处需要同步的实现，正是这层架构要消灭的东西。
 */
const toEditableTarget = (edit: NonNullable<ResolvedText['edit']>): EditableTarget => ({
  sectionKey: edit.sectionKey,
  itemId: edit.itemId ?? '',
  fieldKey: edit.fieldKey,
  kind: edit.kind === 'richText' ? 'html' : 'text',
  label: edit.label,
});

/** `role` 决定语义标签：可访问性、以及「所有小节标题大一号」只改一处。 */
const TAG_BY_ROLE: Record<string, keyof React.JSX.IntrinsicElements> = {
  title: 'h1',
  sectionHeading: 'h2',
  body: 'p',
  caption: 'span',
};

/**
 * 设计模式的渲染上下文。
 *
 * ## 为什么渲染器必须知道自己在不在设计模式
 *
 * **设计模式与就地编辑在「点击」上是冲突的。** 就地编辑要的是「点文字 → 插入光标」，
 * 设计模式要的是「点文字 → 选中这个模板节点」。同一次点击不可能两个都做。
 *
 * 所以设计模式下不套 `Editable`：不是为了省事，是因为套了就会出现「点了想调字号，
 * 结果进了编辑态」这种两边都不对的状态。切换是显式的，用户知道自己在哪个模式。
 */
export interface DomRenderContext {
  design?: {
    /** 当前选中的模板节点 id。渲染出 `data-template-selected`，描边交给 CSS。 */
    selectedId?: string;
  };
}

export function renderNode(node: ResolvedNode, ctx?: DomRenderContext): React.ReactNode {
  const key = node.instanceId;
  const style = toCss(node.style);
  const design = ctx?.design;
  // `each` 展开出的多个实例共用一个 templateNodeId——选中一个就是选中这个模板节点，
  // 所以三条经历会一起描边。这正是设计模式该有的语义：改的是模板，不是某一条。
  const designAttrs = design
    ? {
        'data-template-selected': design.selectedId === node.templateNodeId ? 'true' : undefined,
      }
    : {};

  const withHref = (content: React.ReactNode): React.ReactNode =>
    node.href ? (
      <a key={key} href={node.href} style={{ color: 'inherit' }}>
        {content}
      </a>
    ) : (
      content
    );

  switch (node.type) {
    case 'Box': {
      const editor = node.editor;
      const explicitTitleIcon = editor?.icon
        ? node.children.some((child) => child.type === 'Icon' && child.name === editor.icon)
        : false;
      const titleChild = node.children[0];
      const SectionIcon =
        editor?.icon && !explicitTitleIcon && titleChild?.type === 'Text'
          ? sectionIconByName(editor.icon)
          : null;
      const titleSize =
        titleChild?.type === 'Text' && typeof titleChild.style.fontSize === 'number'
          ? titleChild.style.fontSize
          : 14;
      const titleColor =
        titleChild?.type === 'Text' && typeof titleChild.style.color === 'string'
          ? titleChild.style.color
          : undefined;
      return withHref(
        <div
          key={key}
          data-template-node={node.templateNodeId}
          {...designAttrs}
          style={{
            display: 'flex',
            flexDirection: 'column',
            ...style,
            // 手柄浮在字段左外侧 6px。这两条是它的生存条件：
            // 没有 relative 它会飘到别处，有 overflow:hidden 它会被裁掉——
            // 两种情况下就地编辑都**静默消失**，没有任何报错。
            ...(editor ? { position: 'relative' as const } : {}),
          }}
        >
          {editor?.handle && !design ? (
            <SectionHandle sectionKey={editor.sectionKey} title={editor.title} />
          ) : null}
          {SectionIcon && titleChild ? (
            <div
              data-section-title-icon={editor?.icon}
              style={{ alignItems: 'center', display: 'flex', flexDirection: 'row', gap: 5 }}
            >
              <SectionIcon aria-hidden size={titleSize} style={{ color: titleColor, flexShrink: 0 }} />
              {renderNode(titleChild, ctx)}
            </div>
          ) : null}
          {node.children.slice(SectionIcon ? 1 : 0).map((child) => renderNode(child, ctx))}
          {editor?.insertSlot && !design ? (
            <SectionInsertSlot sectionKey={editor.sectionKey} />
          ) : null}
        </div>,
      );
    }

    case 'Text': {
      // 语义标签照出（可访问性），但**视觉由共享的 role 映射决定**——
      // 靠浏览器默认字重就是第二套来源，必然与 PDF 漂移。
      const roleStyle = toCss(withRoleStyle(node.role, node.style));
      // 可编辑时不能用 span：`Editable` 启用后会在里面渲染一个 div，
      // span 套 div 是非法 HTML，浏览器会把它拆开、破坏布局。
      const Tag =
        (node.role && TAG_BY_ROLE[node.role]) || (node.edit ? 'div' : 'span');
      return withHref(
        <Tag
          key={key}
          data-template-node={node.templateNodeId}
          {...designAttrs}
          style={{ margin: 0, ...roleStyle }}
        >
          {node.edit && !design ? (
            <Editable target={toEditableTarget(node.edit)} text={node.text} />
          ) : (
            node.text
          )}
        </Tag>,
      );
    }

    case 'RichText':
      return (
        <div key={key} data-template-node={node.templateNodeId} {...designAttrs} style={style}>
          {node.edit && !design ? (
            <Editable target={toEditableTarget(node.edit)} html={node.html} />
          ) : (
            <WysiwygContent dirtyHtml={node.html} />
          )}
        </div>
      );

    case 'List':
      return (
        <ul
          key={key}
          data-template-node={node.templateNodeId}
          {...designAttrs}
          style={{ listStyle: 'none', margin: 0, padding: 0, ...style }}
        >
          {node.items.map((item, index) => (
            <li
              key={index}
              style={{ display: 'flex', gap: '0.5em', paddingLeft: listIndent(item.level) }}
            >
              {/*
                符号显式写出来，不用 CSS 的 list-style——**两个后端必须逐字一致**，
                而 PDF 侧画不出 CSS 的 marker。一致性优先于原生列表语义，
                `<li>` 仍然保留，可访问性不受影响。
              */}
              <span aria-hidden style={{ flexShrink: 0 }}>
                {markerFor(item.level, node.ordered, index)}
              </span>
              <span style={{ minWidth: 0 }}>{item.text}</span>
            </li>
          ))}
        </ul>
      );

    case 'Image':
      return withHref(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          data-template-node={node.templateNodeId}
          {...designAttrs}
          src={node.src}
          alt=""
          style={{
            width: node.width,
            height: node.height,
            objectFit: node.fit ?? 'cover',
            ...style,
          }}
        />,
      );

    case 'Icon': {
      const Icon = sectionIconByName(node.name);
      if (!Icon) return null;
      const size = node.size ?? 14;
      return (
        <span key={key} data-template-node={node.templateNodeId} {...designAttrs} style={style}>
          <Icon size={size} />
        </span>
      );
    }

    default:
      // 未知类型在编译期就该被降级掉。走到这里说明编译器漏了——**不崩，什么都不画**。
      return null;
  }
}
