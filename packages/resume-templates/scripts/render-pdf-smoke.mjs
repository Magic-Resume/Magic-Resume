import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import React from 'react';
import { Document, Font, Page, Text, renderToBuffer } from '@react-pdf/renderer';
import { ResumeIconNodes } from '@magic-resume/icons';
import { magicTemplateList } from '../src/config/magic-templates.ts';
import { MagicResumePdfDocument } from '../src/pdf/MagicResumePdfDocument.tsx';
import { PdfHugeIcon } from '../src/pdf/PdfHugeIcon.tsx';
import { magicPdfHyphenationCallback } from '../src/pdf/hyphenation.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 完整字体（非子集）在 full/ 下——根目录只有 .woff2 子集版。此前这里少了 `full`，
// 于是这个冒烟脚本一直因 ENOENT 挂着，仓库唯一的 PDF 检查形同虚设。
const webFontsDir = resolve(packageDir, '../../apps/web/public/fonts/full');

Font.register({
  family: 'Source Han Sans SC',
  fonts: [
    { src: join(webFontsDir, 'SourceHanSansSC-Regular.woff'), fontWeight: 400 },
    { src: join(webFontsDir, 'SourceHanSansSC-RegularOblique.woff'), fontWeight: 400, fontStyle: 'italic' },
    { src: join(webFontsDir, 'SourceHanSansSC-Bold.woff'), fontWeight: 700 },
    { src: join(webFontsDir, 'SourceHanSansSC-BoldOblique.woff'), fontWeight: 700, fontStyle: 'italic' },
  ],
});
Font.register({
  family: 'Source Han Serif SC',
  fonts: [
    { src: join(webFontsDir, 'SourceHanSerifSC-Regular.woff'), fontWeight: 400 },
    { src: join(webFontsDir, 'SourceHanSerifSC-RegularOblique.woff'), fontWeight: 400, fontStyle: 'italic' },
    { src: join(webFontsDir, 'SourceHanSerifSC-Bold.woff'), fontWeight: 700 },
    { src: join(webFontsDir, 'SourceHanSerifSC-BoldOblique.woff'), fontWeight: 700, fontStyle: 'italic' },
  ],
});
Font.registerHyphenationCallback(magicPdfHyphenationCallback);

assert.deepEqual(magicPdfHyphenationCallback('中文'), ['中', '', '文', '']);
assert.deepEqual(magicPdfHyphenationCallback('Reactive'), ['Reactive']);
assert.deepEqual(magicPdfHyphenationCallback(' '), [' ']);

/*
 * 合成粗体守卫。
 *
 * 好几款中文字体上游只有一个字重（朱雀仿宋 / 霞鹜臻楷 / 秋水书体 / 霞鹜标记体），
 * `pdf/browser.tsx` 只能把它们的 700 档指回同一个 Regular 文件。@react-pdf 自己
 * 不合成粗体，于是 `<strong>` 与正文逐像素相同——用户看到的就是「点了加粗没反应」。
 *
 * 修法是三个 patch（`patches/@react-pdf__{layout,textkit,render}`）：把请求的
 * fontWeight 一路透传到渲染层，再用 PDF 的文字渲染模式 2（填充 + 描边）加粗，
 * 判据与浏览器一致——「要粗体，且选中的 face 自己的 usWeightClass < 600」。
 *
 * patch 在依赖升级后失效是**静默**的（内容流里少了两个操作符，PDF 照样生成），
 * 所以在这里钉死：没有真粗体的字体必须出现 `2 Tr`，有真粗体的必须没有。
 */
const pdfContentStreams = async (element) => {
  const raw = (await renderToBuffer(element)).toString('latin1');
  const streams = [];
  for (const match of raw.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      streams.push(inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1'));
    } catch {
      // 字体等非 Flate 流，跳过
    }
  }
  return streams.join('\n');
};

const boldProbe = (fontFamily) =>
  React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4' },
      React.createElement(Text, { style: { fontFamily, fontSize: 11, fontWeight: 700 } }, '加粗验证'),
    ),
  );

// 同一个 Regular 文件同时挂 400 与 700，复刻 pdf/browser.tsx 对这几款字体的注册方式。
Font.register({
  family: 'Magic Faux Bold Probe',
  fonts: [
    { src: join(webFontsDir, 'SourceHanSansSC-Regular.woff'), fontWeight: 400 },
    { src: join(webFontsDir, 'SourceHanSansSC-Regular.woff'), fontWeight: 700 },
  ],
});

assert.match(
  await pdfContentStreams(boldProbe('Magic Faux Bold Probe')),
  /^2 Tr$/m,
  '没有真粗体文件的字体，<strong> 必须靠文字渲染模式 2 合成粗体——'
    + '这三个 patch(@react-pdf/layout + textkit + render)已经失效',
);
assert.doesNotMatch(
  await pdfContentStreams(boldProbe('Source Han Sans SC')),
  /^2 Tr$/m,
  '有真 Bold 文件的字体不该再描边，否则导出会比屏幕更粗',
);

const iconElement = PdfHugeIcon({ icon: ResumeIconNodes.mail, color: '#3b82f6', size: 12 });
for (const primitive of React.Children.toArray(iconElement.props.children)) {
  assert.equal(primitive.props.fill, 'none', 'Hugeicons PDF primitives must disable the default black fill');
  assert.equal(primitive.props.stroke, '#3b82f6', 'Hugeicons PDF primitives must receive the requested stroke color');
  assert.equal(primitive.props.strokeWidth, 1.5, 'Hugeicons PDF primitives must preserve the requested stroke width');
}

const repeatedSummary = [
  '<p>负责复杂产品的规划与交付，推动业务团队协同开发以及日常值周oncall处理；负责 40+ PO 与 4 个 PO 级需求迭代，如 “Inspection 平台接入”、“Approval Flow Photo适配”等核心项目。</p>',
  '<p>基于 React + TypeScript monorepo架构，完成 AI 解析、多模板渲染、PDF 导出等能力，并通过 pnpm patch 重写 @react-pdf/textkit 字体度量读取逻辑。</p>',
  '<p><em>斜体混排：React项目、Photo适配、monorepo架构与中文斜体。</em></p>',
  '<ul>',
  '<li><p><strong>智能表格与 Agent 落地：</strong><br>完成核心架构设计与交付。</p></li>',
  '<li><p><span style="color: #dc2626"><u>跨团队协作</u></span>并持续优化体验。</p></li>',
  '</ul>',
].join('');
const richTextCoverage = [
  '<h2 style="text-align: center">富文本能力验证</h2>',
  '<p><em><u>斜体下划线</u></em>、<strong><em>粗斜体</em></strong>、<s>删除线</s>、<a href="https://example.com">链接</a>与<code>inline code</code></p>',
  '<ol><li><p>编号列表一</p></li><li><p>编号列表二</p></li></ol>',
].join('');
const entries = Array.from({ length: 8 }, (_, index) => ({
  id: `experience-${index}`,
  visible: true,
  company: `示例科技有限公司 ${index + 1}`,
  position: '高级产品工程师',
  date: `20${18 + index} - 至今`,
  location: '上海',
  summary: repeatedSummary,
}));

const data = {
  id: 'pdf-smoke-test',
  name: '中文简历 PDF 测试',
  updatedAt: Date.now(),
  info: {
    fullName: '张三',
    headline: '高级产品工程师',
    email: 'zhangsan@example.com',
    phoneNumber: '138-0000-0000',
    address: '上海市浦东新区',
    website: 'example.com',
    avatar: '',
    customFields: [],
  },
  sections: {
    summary: [{ id: 'summary', visible: true, name: '简介', summary: richTextCoverage }],
    experience: entries,
    education: [{ id: 'education', visible: true, school: '示例大学', degree: '硕士', major: '计算机科学', date: '2015 - 2018', summary: '优秀毕业生' }],
    projects: [{ id: 'project', visible: true, name: '智能简历项目', role: '负责人', date: '2025', summary: repeatedSummary }],
    skills: [{ id: 'skill', visible: true, name: 'TypeScript / React', level: '精通', summary: '前端工程化' }],
    languages: [{ id: 'language', visible: true, language: '中文', level: '母语' }],
    certificates: [{ id: 'certificate', visible: true, certificate: '示例认证', date: '2025' }],
    profiles: [{ id: 'profile', visible: true, name: 'GitHub', username: 'zhangsan', url: 'https://github.com/zhangsan' }],
    awards: [],
  },
  sectionOrder: [
    { key: 'summary', label: '个人总结' },
    { key: 'experience', label: '工作经历' },
    { key: 'projects', label: '项目经历' },
    { key: 'education', label: '教育经历' },
    { key: 'skills', label: '专业技能' },
    { key: 'languages', label: '语言能力' },
    { key: 'certificates', label: '证书资质' },
    { key: 'profiles', label: '个人主页' },
  ],
  template: 'classic',
  themeColor: '#2563eb',
  typography: 'Source Han Sans SC',
};

const requestedOutputDir = process.env.PDF_SMOKE_OUTPUT_DIR;
const outputDir = requestedOutputDir
  ? resolve(requestedOutputDir)
  : await mkdtemp(join(tmpdir(), 'magic-resume-pdf-'));
await mkdir(outputDir, { recursive: true });

try {
  for (const template of magicTemplateList) {
    const document = React.createElement(MagicResumePdfDocument, {
      data: { ...data, template: template.id },
      template,
      locale: 'zh-CN',
    });
    const buffer = await renderToBuffer(document);
    const outputPath = join(outputDir, `${template.id}.pdf`);
    await writeFile(outputPath, buffer);
    const bytes = await readFile(outputPath);

    assert.equal(bytes.subarray(0, 4).toString(), '%PDF', `${template.id} did not render a PDF`);
    assert.ok(bytes.byteLength > 10_000, `${template.id} PDF was unexpectedly small`);

    const pdfSource = bytes.toString('latin1');
    assert.match(pdfSource, /\/Count 1\b/, `${template.id} should render as one free-form page`);

    const mediaBox = pdfSource.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(mediaBox, `${template.id} PDF did not contain a page MediaBox`);
    // 595.5 而不是 A4 真值 595.2756：页宽来自模板的 containerWidth（794 CSS px），
    // 794 × 0.75 = 595.5。794 本身是 793.7 取整来的（PAGE_WIDTH_PX 供面板用）。
    // 差 0.22pt ≈ 0.078mm，实际无意义——但这条断言原本卡在 ±0.1，**从未通过过**，
    // 于是整个冒烟脚本长期是红的、没人跑。放宽到 ±1 让它能真正当守卫用。
    assert.ok(Math.abs(Number(mediaBox[1]) - 595.28) < 1, `${template.id} did not keep the A4 page width`);
    assert.ok(Number(mediaBox[2]) > 841.89, `${template.id} did not grow beyond the A4 minimum height`);
  }

  console.log(`Rendered ${magicTemplateList.length} templates successfully.`);
} finally {
  if (!requestedOutputDir) await rm(outputDir, { recursive: true, force: true });
}
