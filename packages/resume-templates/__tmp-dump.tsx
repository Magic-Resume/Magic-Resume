import React from 'react';
import { PdfRichText } from './src/pdf/PdfRichText';

const html = `<p><strong>会员中心签约产品功能全量上线</strong></p><ul><li><p>参与会员中心签约功能需求评审，日均签约量提升 <strong>20%</strong>。</p></li></ul><ul><li><p>设计并注入 <strong>PUSH_ENV</strong> 环境变量，缩短周期约 <strong>30%</strong>。</p></li></ul>`;

type Any = any;

const expand = (node: Any): Any => {
  if (node === null || node === undefined || typeof node === 'boolean') return null;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return String(node);

  const el = node as React.ReactElement<Any>;
  const type: Any = el.type;

  if (typeof type === 'function') {
    const out = (type as Any)(el.props);
    return expand(out);
  }
  if (type === React.Fragment) {
    return expand((el.props as Any).children);
  }

  const { children, style, ...rest } = (el.props ?? {}) as Any;
  return {
    tag: String(type),
    style: style ?? null,
    props: Object.keys(rest).length ? Object.keys(rest) : undefined,
    children: expand(children),
  };
};

const tree = expand(
  React.createElement(PdfRichText, {
    html,
    color: '#000000',
    fontFamily: 'MagicSans',
    fontSize: 10,
  }),
);

console.log(JSON.stringify(tree, null, 1));
