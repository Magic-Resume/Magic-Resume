import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILT_IN_SECTION_KEYS,
  ZH_TITLE_BY_SECTION_KEY,
  isBuiltInSection,
  zhTitleForSection,
} from './sectionSemantics';

/**
 * 这条守着一个**真实发生过的线上 bug**：
 *
 * 屏幕与 PDF 各存了一份「内建分区」表，PDF 那份把 `summary` / `awards` 也算作内建。
 * 而守卫是「内建 → 不合成」，于是 19 个模板里有 16 个**在屏幕上显示个人总结、
 * 导出 PDF 却没有**——用户内容在导出时凭空消失，没有任何报错。
 *
 * 决定：以屏幕为准。模板没声明 summary 时**要**替它合成出来。
 */
test('summary 与 awards 不是内建分区——模板没声明时必须合成，否则导出会丢用户内容', () => {
  assert.equal(isBuiltInSection('summary'), false);
  assert.equal(isBuiltInSection('awards'), false);
});

test('核心分区是内建的——模板留空是有意的，合成会把 i18n key 印成标题', () => {
  for (const key of ['experience', 'education', 'projects', 'skills']) {
    assert.equal(isBuiltInSection(key), true, `${key} 应当是内建`);
  }
});

/**
 * 「有中文标题」与「是内建分区」是**两件事**。它们原来挤在同一张表里，
 * 于是 `summary` 无法同时「有中文名」和「可被合成」——两个渲染器各选了一边。
 */
test('summary 有中文标题，但不是内建——两个职责必须能分开表达', () => {
  assert.equal(ZH_TITLE_BY_SECTION_KEY.summary, '个人总结');
  assert.equal(BUILT_IN_SECTION_KEYS.has('summary'), false);
});

test('标题解析：先按 key，再按英文名猜，都没有就用原文', () => {
  assert.equal(zhTitleForSection('experience', 'Anything'), '工作经历');
  assert.equal(zhTitleForSection(undefined, 'Work Experience'), '工作经历');
  assert.equal(zhTitleForSection('', '  SKILLS  '), '专业技能');
  assert.equal(zhTitleForSection('unknown-key', '获奖经历'), '获奖经历');
});

/** 两端的英文表原本也漂了：屏幕独有 header/profile/contact，PDF 独有 links。取并集。 */
test('英文标题表是两端的并集，不是任一边的子集', () => {
  for (const [english, zh] of [
    ['header', '基本信息'],
    ['profile', '个人信息'],
    ['contact', '联系方式'],
    ['links', '个人主页'],
  ] as const) {
    assert.equal(zhTitleForSection(undefined, english), zh, `${english} 缺失`);
  }
});
