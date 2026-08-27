#!/usr/bin/env node
/**
 * Legacy 冻结守卫。
 *
 * ## 为什么需要它
 *
 * 原语层与 legacy 组件是**永久共存**的两条路径（19 个旧模板一行不改）。但
 * 「共存」如果不设闸门，实际会退化成「两条路都在长」——而两条路都在长，正是
 * 当初 `summary` / `awards` 在导出里静默消失的成因：同一个判断在屏幕侧和 PDF 侧
 * 各写了一份，然后漂了。
 *
 * 所以规矩是：**legacy 只修 bug，不长新功能。** 新版式一律走原语树。
 * 这条规矩靠人自觉守不住，因为违反它在当下总是更省事——改一个旧组件比新增一棵树快。
 * 这个脚本把它变成一次会失败的构建。
 *
 * ## 它守什么、不守什么
 *
 * 守：只被 legacy 渲染路径使用的组件文件。
 * 不守：两条路共用的东西（`WysiwygContent` / `utils` / `sectionIcons`），
 *      以及 `MagicResumeRenderer`（它持有分发接缝，本来就要改）。
 *
 * ## 真要改怎么办
 *
 * 跑 `npm run freeze:update`，**并在提交信息里写清为什么**。哈希变更会出现在
 * diff 里，评审时看得见——这是有意的摩擦，不是禁令。
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const MANIFEST = join(root, 'legacy-freeze.json');

/** 纯 legacy 面。新增 legacy 组件是不被允许的，所以这份清单也是固定的。 */
const FROZEN = [
  'src/templateLayout/CenteredPhotoHeader.tsx',
  'src/templateLayout/CompactList.tsx',
  'src/templateLayout/ContactInfo.tsx',
  'src/templateLayout/DefaultSection.tsx',
  'src/templateLayout/Header.tsx',
  'src/templateLayout/InlineKeyValueSection.tsx',
  'src/templateLayout/Layout.tsx',
  'src/templateLayout/ListSection.tsx',
  'src/templateLayout/ProfileCard.tsx',
  'src/templateLayout/ThreeColumnSection.tsx',
  'src/templateLayout/Timeline.tsx',
  'src/templateLayout/TwoColumnLayout.tsx',
];

const hashOf = async (rel) => {
  const buf = await readFile(join(root, rel));
  // 行尾归一化：换个操作系统 checkout 一次不该报警。
  return createHash('sha256').update(buf.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
};

const current = async () => {
  const out = {};
  for (const rel of FROZEN) out[rel] = await hashOf(rel);
  return out;
};

const update = process.argv.includes('--update');

if (update) {
  const next = await current();
  await writeFile(MANIFEST, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`已更新冻结清单（${Object.keys(next).length} 个文件）。请在提交信息里说明改动 legacy 的原因。`);
  process.exit(0);
}

let expected;
try {
  expected = JSON.parse(await readFile(MANIFEST, 'utf8'));
} catch {
  console.error(`缺少 ${MANIFEST}。先跑一次 npm run freeze:update 建立基线。`);
  process.exit(1);
}

const actual = await current();
const changed = FROZEN.filter((rel) => expected[rel] !== actual[rel]);
const missing = FROZEN.filter((rel) => !(rel in expected));

if (changed.length === 0 && missing.length === 0) {
  console.log(`legacy 冻结完好（${FROZEN.length} 个文件）。`);
  process.exit(0);
}

console.error('\n✖ 改到了已冻结的 legacy 渲染组件：\n');
for (const rel of changed) console.error(`  · ${rel}`);
for (const rel of missing) console.error(`  · ${rel}（不在清单里）`);
console.error(`
这些组件已停止演进。要加新版式，请写一棵原语树
（packages/resume-templates/src/primitives/presets/ 下有第一个例子），
而不是改这里——legacy 每长一点，屏幕与 PDF 两份实现就多一处要靠人手同步的地方。

若这次确实是必要的 bug 修复：
  npm run freeze:update
并在提交信息里写清原因。
`);
process.exit(1);
