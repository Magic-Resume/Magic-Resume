import React from 'react';
import { Image, Link, Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { PdfRichText } from '../../pdf/PdfRichText';
import { PdfHugeIcon } from '../../pdf/PdfHugeIcon';
import { iconNodeByName } from '../icons';
import { listIndentPoints, markerFor } from '../listMarkers';
import { LENGTH_KEYS, PX_TO_PT } from '../style';
import { withRoleStyle } from '../roleStyles';
import type { ResolvedNode, ResolvedStyle } from '../types';

/**
 * PDF 后端：Resolved IR → react-pdf 原语。
 *
 * 与 DOM 后端**逐条对应**——同一个 IR 节点，两边画出同一个东西。它同样不理解业务：
 * 不读简历、不执行 `each` / `when`、不做 URL 安全化。
 *
 * 词汇表的每一条都是「两个后端都能实现」筛出来的，所以这个文件不该出现
 * 「PDF 做不到，凑合一下」的分支——真出现了，说明那条不该进词汇表。
 */

/**
 * IR 的样式键与 react-pdf 的 Style 同名，但**单位不同**：IR 的长度是 CSS px，
 * react-pdf 的数字是点。不换算的话同一棵树在 PDF 里整体大 33%，
 * 而且因为数值本身相等，一致性测试也抓不到。换算就发生在这个边界上。
 *
 * 字重已在编译期限制到 400/700，理由见 `style.ts` 的 `ALLOWED_FONT_WEIGHTS`——
 * **不是**因为会抛，而是因为它会静默回落、造成两个后端不一致。
 */
const toPdf = (style: ResolvedStyle): Style => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    out[key] = typeof value === 'number' && LENGTH_KEYS.has(key) ? value * PX_TO_PT : value;
  }
  return out as Style;
};

/** 默认字号（点），用于列表缩进换算——IR 没给就按这个算。 */
const DEFAULT_FONT_SIZE = 10 * PX_TO_PT;

/**
 * 渲染上下文。
 *
 * **字体族是文档级的，不是节点级的**——所以它不在样式白名单里，而从这里传进来。
 * react-pdf 遇到**没注册的字体族**会直接 throw（实测：`Font family not registered`），
 * 把它开放给模板作者等于把导出的成败交给一个字符串。
 */
export interface PdfRenderContext {
  fontFamily: string;
}

export function renderNode(node: ResolvedNode, ctx: PdfRenderContext): React.ReactNode {
  const key = node.instanceId;
  const style = toPdf(node.style);

  switch (node.type) {
    case 'Box': {
      const editor = node.editor;
      const explicitTitleIcon = editor?.icon
        ? node.children.some((child) => child.type === 'Icon' && child.name === editor.icon)
        : false;
      const titleChild = node.children[0];
      const titleIcon =
        editor?.icon && !explicitTitleIcon && titleChild?.type === 'Text'
          ? iconNodeByName(editor.icon)
          : undefined;
      const titleStyle =
        titleChild?.type === 'Text' ? toPdf(withRoleStyle(titleChild.role, titleChild.style)) : undefined;
      const titleSize = (titleStyle?.fontSize as number | undefined) ?? 10.5;
      const titleColor = (titleStyle?.color as string | undefined) ?? (style.color as string) ?? '#000';
      const content = (
        // react-pdf 的 View 默认就是 column flex，与 DOM 后端显式写的一致。
        <View key={key} style={style} {...(node.keepTogether ? { wrap: false } : {})}>
          {titleIcon && titleChild ? (
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
              <PdfHugeIcon icon={titleIcon} size={titleSize} color={titleColor} style={{ flexShrink: 0 }} />
              {renderNode(titleChild, ctx)}
            </View>
          ) : null}
          {node.children.slice(titleIcon ? 1 : 0).map((child) => renderNode(child, ctx))}
        </View>
      );
      return node.href ? (
        <Link key={key} src={node.href} style={{ textDecoration: 'none' }}>
          {content}
        </Link>
      ) : (
        content
      );
    }

    case 'Text': {
      const merged = toPdf(withRoleStyle(node.role, node.style));
      return node.href ? (
        <Link key={key} src={node.href} style={merged}>
          {node.text}
        </Link>
      ) : (
        <Text key={key} style={merged}>
          {node.text}
        </Text>
      );
    }

    case 'RichText':
      return (
        <View key={key} style={style}>
          <PdfRichText
            html={node.html}
            fontFamily={ctx.fontFamily}
            fontSize={(style.fontSize as number) ?? DEFAULT_FONT_SIZE}
            color={(style.color as string) ?? '#000'}
          />
        </View>
      );

    case 'List': {
      const fontSize = (style.fontSize as number) ?? DEFAULT_FONT_SIZE;
      return (
        <View key={key} style={style}>
          {node.items.map((item, index) => (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                marginLeft: listIndentPoints(item.level, fontSize),
              }}
            >
              {/* 符号来自共享的 `listMarkers`——与 DOM 后端**逐字同一份**。 */}
              <Text style={{ flexShrink: 0, width: fontSize * 1.35 }}>
                {markerFor(item.level, node.ordered, index)}
              </Text>
              <Text style={{ flexBasis: 0, flexGrow: 1, minWidth: 0 }}>{item.text}</Text>
            </View>
          ))}
        </View>
      );
    }

    case 'Image':
      return (
        <Image
          key={key}
          src={node.src}
          style={{
            ...(node.width ? { width: node.width } : {}),
            ...(node.height ? { height: node.height } : {}),
            ...(node.fit ? { objectFit: node.fit } : {}),
            ...style,
          }}
        />
      );

    case 'Icon': {
      // **必须是 Hugeicons 的原始路径数据，不是 React 图标组件。**
      // 喂错了会在渲染时抛 `icon.map is not a function`，整份导出失败——
      // 而且屏幕上完全正常，只有导出时才炸。曾经用 `as never` 压过这个类型错误。
      const icon = iconNodeByName(node.name);
      if (!icon) return null;
      return (
        <PdfHugeIcon
          key={key}
          icon={icon}
          size={node.size ?? 14}
          color={(style.color as string) ?? '#000'}
        />
      );
    }

    default:
      // 与 DOM 后端同样的处理：不崩，什么都不画。
      return null;
  }
}
