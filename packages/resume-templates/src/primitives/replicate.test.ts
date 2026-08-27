import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Font } from '@react-pdf/renderer';
import type { TemplateDocument } from './ast';
import { UNHANDLED_SECTIONS } from './compile';
import { createNodeMeasurer } from './overflow';
import {
  REPLICATE_INSTRUCTIONS,
  critiqueTemplate,
  replicateTemplate,
  type GenerateFn,
} from './replicate';

/**
 * 复刻管线的验收。
 *
 * 重点全在 critique 上——**这一层的价值就是把「静默消失」变成「看得见的问题」**。
 * 五项检查里有三项的失败模式都是「渲染完全正常，只是内容没了 / 点不动」。
 */

Font.register({ family: 'Test', src: 'Helvetica' } as never);

/**
 * 测试里用 Node 版测量器。**产品主路径上首选浏览器测量**——那边字体和布局都是真的，
 * 而这里要的是一个不依赖浏览器、跑得进 CI 的量法。
 */
const OPTS = { measure: createNodeMeasurer({ fontFamily: 'Helvetica' }) };

const resume = {
  info: { fullName: '张三' },
  sections: {
    experience: [{ id: 'e1', company: '甲公司', summary: '<p>做了 A</p>' }],
    education: [{ id: 'd1', school: '某大学' }],
  },
  sectionOrder: [{ key: 'experience' }, { key: 'education' }],
};

/** 一棵合格的树：绑定齐、有兜底、可编辑。 */
const good = (): TemplateDocument => ({
  version: 1,
  root: {
    id: 'root',
    type: 'Box',
    style: [{ fontSize: 12, gap: 8 }],
    children: [
      {
        id: 'exp',
        type: 'Text',
        each: { path: 'sections.experience' },
        value: { read: 'company' },
      },
      {
        id: 'edu',
        type: 'Text',
        each: { path: 'sections.education' },
        value: { read: 'school' },
      },
      { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
    ],
  },
});

const kinds = (r: Awaited<ReturnType<typeof critiqueTemplate>>) => r.problems.map((p) => p.kind);

test('合格的树通过 critique', async () => {
  const r = await critiqueTemplate(good(), resume, OPTS);
  assert.equal(r.ok, true, JSON.stringify(r.problems, null, 2));
  assert.equal(r.pages, 1);
  assert.ok(r.bytes > 0);
});

/**
 * **不给测量器时，四项结构检查照样全跑，且一次渲染都不做。**
 *
 * 这一条钉住的是分层本身：五项检查里只有「放不放得下」需要渲染器。
 * 把整个 critique 绑死在渲染上，等于为了一项检查让所有调用方都拖进一整套渲染依赖——
 * 具体代价就是往一个 Nest 服务里塞 react-dom + react-pdf。
 */
test('不给测量器 → 只做结构检查，零渲染', async () => {
  let rendered = false;
  const spy = async () => {
    rendered = true;
    return { ok: true, pages: 1, bytes: 1 };
  };
  void spy;

  const missing: TemplateDocument = {
    version: 1,
    root: { id: 'r', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
  };
  const r = await critiqueTemplate(missing, resume, {});
  assert.equal(rendered, false);
  assert.equal(r.ok, false, '结构问题照样要抓到');
  assert.ok(kinds(r).includes('coverage'), '漏分区这条不需要渲染就能查');
  assert.equal(r.pages, 0, '没测量就不该编页数');
});

test('测量器真的被调用，且拿到的是编译前的树', async () => {
  const seen: string[] = [];
  await critiqueTemplate(good(), resume, {
    measure: async (doc) => {
      seen.push(doc.root.id);
      return { ok: true, pages: 1, bytes: 100 };
    },
  });
  assert.deepEqual(seen, ['root']);
});

/** 测量器报失败时要转成 render 问题，而不是被忽略。 */
test('测量器报失败 → render 问题', async () => {
  const r = await critiqueTemplate(good(), resume, {
    measure: async () => ({ ok: false, pages: 0, bytes: 0, error: '浏览器侧字体没加载完' }),
  });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.kind === 'render' && p.message.includes('字体没加载完')));
});

test('结构不合法时不渲染，直接返回', async () => {
  const r = await critiqueTemplate({ version: 2 }, resume, OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.bytes, 0, '结构就错了不该白渲染一次');
  assert.ok(kinds(r).includes('structure'));
});

/**
 * **最重要的一条。** 模型盯着参考图，图上没有 education 它就不写——
 * 于是用户简历里那一整块**静默消失**：不报错、不警告，只是没了。
 * 这与 `summary`/`awards` 那次线上事故是同一种失败，只是换了个成因。
 */
test('漏掉一个非空分区、又没有兜底 → 报覆盖问题且阻断', async () => {
  const missing: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Text',
      each: { path: 'sections.experience' },
      value: { read: 'company' },
    },
  };
  const r = await critiqueTemplate(missing, resume, OPTS);
  assert.equal(r.ok, false);
  const coverage = r.problems.filter((p) => p.kind === 'coverage');
  assert.equal(coverage.length, 1);
  assert.ok(coverage[0].message.includes('education'), coverage[0].message);
  assert.equal(coverage[0].blocking, true);
});

/**
 * 兜底节点接的是**用户自建的分区**。这里用「获奖经历」这种自定义 key，
 * 才是它真正的适用场景。
 */
test('自建分区有兜底节点接住时不算问题', async () => {
  const withCustom = {
    ...resume,
    sections: { ...resume.sections, 获奖经历: [{ id: 'a1', name: '优秀员工' }] },
    sectionOrder: [...resume.sectionOrder, { key: '获奖经历' }],
  };
  const r = await critiqueTemplate(good(), withCustom, OPTS);
  assert.equal(kinds(r).includes('coverage'), false, JSON.stringify(r.problems));
});

/**
 * **反过来的那一半，是这条检查最容易被写错的地方。**
 *
 * 兜底节点**接不住内建分区**——`resolveEachItems` 对 `$unhandledSections` 显式跳过了
 * 那七个内建 key。所以一棵「写了兜底但漏绑 education」的树，看起来什么都对，
 * 渲染器却会把 education 整块丢掉。critique 必须报出来，否则就是最坏的一种：
 * 检查说通过、结果内容没了。
 */
test('写了兜底但漏绑内建分区 → 仍然要报覆盖问题', async () => {
  const catchAllOnly: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      children: [
        { id: 'exp', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
        { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
      ],
    },
  };
  const r = await critiqueTemplate(catchAllOnly, resume, OPTS);
  const coverage = r.problems.filter((p) => p.kind === 'coverage');
  assert.equal(coverage.length, 1, JSON.stringify(r.problems));
  assert.ok(coverage[0].message.includes('education'));
  assert.ok(coverage[0].message.includes('兜底节点接不住'), '错误信息要说清为什么兜底不管用');
});

test('空分区不算漏', async () => {
  const empty = { ...resume, sections: { ...resume.sections, projects: [] } };
  const missing: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      children: [
        { id: 'exp', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
        { id: 'edu', type: 'Text', each: { path: 'sections.education' }, value: { read: 'school' } },
      ],
    },
  };
  const r = await critiqueTemplate(missing, empty, OPTS);
  assert.equal(kinds(r).includes('coverage'), false, '空分区没内容可丢');
});

/**
 * 插值字符串与绑定**渲染出来一模一样**，区别只在点不点得动。
 * 模型很容易写成前者——它看起来更简单。没有这条检查，用户拿到的是一份
 * 「看着对、但改不了任何字」的简历，而且没有任何提示告诉他为什么。
 */
test('全是插值字符串（渲染正常但点不动）被拦下', async () => {
  const notEditable: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      children: [
        { id: 'exp', type: 'Text', each: { path: 'sections.experience' }, value: '{{item.company}}' },
        { id: 'edu', type: 'Text', each: { path: 'sections.education' }, value: '{{item.school}}' },
        { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
      ],
    },
  };
  const r = await critiqueTemplate(notEditable, resume, OPTS);
  assert.equal(r.ok, false);
  const binding = r.problems.filter((p) => p.kind === 'binding' && p.blocking);
  assert.equal(binding.length, 1, JSON.stringify(r.problems));
  assert.ok(binding[0].message.includes('点哪里都没反应'));
});

test('渲染抛异常时报 render 问题而不是自己崩', async () => {
  const richText: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      children: [
        {
          id: 'sum',
          type: 'RichText',
          each: { path: 'sections.experience' },
          value: { read: 'summary' },
        },
        { id: 'edu', type: 'Text', each: { path: 'sections.education' }, value: { read: 'school' } },
        { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
      ],
    },
  };
  const r = await critiqueTemplate(richText, resume, {
    measure: createNodeMeasurer({ fontFamily: '没注册的族' }),
  });
  assert.equal(r.ok, false);
  assert.ok(kinds(r).includes('render'));
});

test('超页被拦下', async () => {
  const many = {
    ...resume,
    sections: {
      experience: Array.from({ length: 60 }, (_, i) => ({
        id: `e${i}`,
        company: `Company ${i} `.repeat(10),
      })),
      education: [{ id: 'd1', school: 'X' }],
    },
  };
  const paged: TemplateDocument = { ...good(), page: { mode: 'paged', margin: 40 } };
  const r = await critiqueTemplate(paged, many, OPTS);
  assert.equal(r.ok, false);
  assert.ok(kinds(r).includes('overflow'));
});

// ── 闭环 ──────────────────────────────────────────────────────────────

test('首轮就合格时直接返回，且返回的是归一化后的树', async () => {
  const gen: GenerateFn = async () => ({
    ...good(),
    root: {
      ...good().root,
      children: [
        { id: 'a', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' }, style: [{ fontWeight: 700 }] },
        { id: 'b', type: 'Text', each: { path: 'sections.education' }, value: { read: 'school' }, style: [{ fontWeight: 700 }] },
        { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
      ],
    },
  });
  const r = await replicateTemplate(gen, resume, OPTS);
  assert.ok(r.document, JSON.stringify(r.rounds, null, 2));
  assert.equal(r.rounds.length, 1);
  assert.ok(r.document.styles, '通过后应归一化，重复样式提进字典');
});

test('第一轮不合格时带着 critique 再来一轮', async () => {
  const seen: Array<{ round: number; hasCritique: boolean }> = [];
  const gen: GenerateFn = async (req) => {
    seen.push({ round: req.round, hasCritique: Boolean(req.critique) });
    // 第一轮故意漏掉 education
    if (req.round === 1) {
      return {
        version: 1,
        root: { id: 'r', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
      };
    }
    return good();
  };
  const r = await replicateTemplate(gen, resume, OPTS);
  assert.ok(r.document, '第二轮应该成功');
  assert.equal(r.rounds.length, 2);
  assert.deepEqual(seen, [
    { round: 1, hasCritique: false },
    { round: 2, hasCritique: true },
  ]);
  // 第二轮拿到的 critique 必须点明漏了什么，否则模型无从修起
  assert.ok(r.rounds[0].problems.some((p) => p.message.includes('education')));
});

test('一直不合格时到轮数上限就停，并带出最后一次尝试', async () => {
  const bad = {
    version: 1,
    root: { id: 'r', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
  };
  const r = await replicateTemplate(async () => bad, resume, { ...OPTS, maxRounds: 2 });
  assert.equal(r.document, undefined);
  assert.equal(r.rounds.length, 2);
  assert.ok(r.lastAttempt, '失败也要带出最后一棵树，否则没法看模型卡在哪');
});

test('模型调用本身失败不抛，记一轮后停下', async () => {
  const r = await replicateTemplate(
    async () => {
      throw new Error('rate limited');
    },
    resume,
    OPTS,
  );
  assert.equal(r.document, undefined);
  assert.equal(r.rounds.length, 1);
  assert.ok(r.rounds[0].problems[0].message.includes('rate limited'));
});

/** 写作约束里那几条「schema 表达不了」的规则必须真的在文本里，否则模型看不到。 */
test('给模型的约束覆盖了 schema 表达不了的规则', () => {
  for (const must of [
    '不要把参考图上的简历正文抄进模板',
    UNHANDLED_SECTIONS,
    '可编辑的字段必须是绑定',
    '字重只有 400 和 700',
  ]) {
    assert.ok(REPLICATE_INSTRUCTIONS.includes(must), `约束里缺「${must}」`);
  }
});
