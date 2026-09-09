import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Resume } from '../types/resume';
import {
  prepareBoundImageFields,
  prepareTemplateImages,
  type ImageConverter,
} from './prepareImages';

/** 记录每次转码请求，好断言「转了什么、用什么格式转的」。 */
const recorder = () => {
  const calls: { src: string; mime: string }[] = [];
  const convert: ImageConverter = async (src, mime) => {
    calls.push({ src, mime });
    return `data:${mime};base64,CONVERTED(${src})`;
  };
  return { calls, convert };
};

const failing: ImageConverter = async () => {
  throw new Error('CORS blocked');
};

test('把模板树里写死的 Image src 转成 PDF 画得出来的形式', async () => {
  const { calls, convert } = recorder();
  const tree = {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      children: [
        { id: 'a', type: 'Image', src: 'https://cdn.test/a.webp' },
        { id: 'b', type: 'Text', value: 'https://cdn.test/not-an-image.webp' },
      ],
    },
  };

  const out = (await prepareTemplateImages(tree, convert)) as typeof tree;

  assert.equal(out.root.children[0].src, 'data:image/png;base64,CONVERTED(https://cdn.test/a.webp)');
  // Text 的 value 不是图片来源，不该被当成 src 抓下来。
  assert.equal(out.root.children[1].value, 'https://cdn.test/not-an-image.webp');
  assert.deepEqual(calls, [{ src: 'https://cdn.test/a.webp', mime: 'image/png' }]);
});

test('logo 一律转 PNG —— JPEG 无 alpha，白底会在深色版式上变成白斑', async () => {
  const { calls, convert } = recorder();
  await prepareTemplateImages(
    { id: 'x', type: 'Image', src: 'https://cdn.test/logo.png' },
    convert,
  );
  assert.equal(calls[0].mime, 'image/png');
});

test('绑定字段也要转 —— 只走模板树会漏掉 {read:companyLogo} 那条路', async () => {
  const { calls, convert } = recorder();
  const sections = {
    experience: [
      { id: '1', visible: true, company: 'A', companyLogo: 'https://cdn/a.png' },
      { id: '2', visible: true, company: 'B' },
    ],
  } as unknown as Resume['sections'];

  const out = (await prepareBoundImageFields(sections, convert)) as Record<
    string,
    Record<string, unknown>[]
  >;

  assert.equal(
    out.experience[0].companyLogo,
    'data:image/png;base64,CONVERTED(https://cdn/a.png)',
  );
  // 没有 logo 的条目原样保留，不该凭空多出一个空字段。
  assert.equal('companyLogo' in out.experience[1], false);
  assert.equal(calls.length, 1);
});

test('单张图失败只清空那一张，其余照常导出', async () => {
  const tree = {
    id: 'root',
    type: 'Box',
    children: [{ id: 'a', type: 'Image', src: 'https://blocked.test/a.png' }],
  };

  const out = (await prepareTemplateImages(tree, failing)) as typeof tree;

  // 空 src 的 Image 节点会被编译期整个丢弃，版面自动收拢；这好过让整份简历导不出来。
  assert.equal(out.children[0].src, '');
});

test('绑定字段转码失败同样降级成空字符串而不是抛出', async () => {
  const sections = {
    experience: [{ id: '1', visible: true, companyLogo: 'https://blocked/a.png' }],
  } as unknown as Resume['sections'];

  const out = (await prepareBoundImageFields(sections, failing)) as Record<
    string,
    Record<string, unknown>[]
  >;

  assert.equal(out.experience[0].companyLogo, '');
});

test('不是数组的 section 值原样穿过，不会把结构弄坏', async () => {
  const { convert } = recorder();
  const sections = { weird: 'not-an-array' } as unknown as Resume['sections'];
  const out = (await prepareBoundImageFields(sections, convert)) as Record<
    string,
    unknown
  >;
  assert.equal(out.weird, 'not-an-array');
});
