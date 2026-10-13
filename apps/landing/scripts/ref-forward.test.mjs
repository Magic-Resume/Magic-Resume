import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { transformWithEsbuild } from 'vite';

// Exercise the same minified source that RefForward.astro embeds, without a DOM dependency.
const source = await readFile(new URL('../src/components/ref-forward.js', import.meta.url), 'utf8');
const { code } = await transformWithEsbuild(source, 'ref-forward.js', { minify: true });
const cta = '/dashboard?utm_source=landing&utm_medium=cta&utm_content=header&utm_term=zh';

function target(href = cta, attribute = 'href') {
  const attributes = { 'data-ref-forward': attribute, [attribute]: href };
  return {
    attributes,
    children: [],
    writes: 0,
    getAttribute(name) { return attributes[name]; },
    setAttribute(name, value) { attributes[name] = value; this.writes++; },
    querySelector(selector) {
      assert.equal(selector, '[name="utm_campaign"]');
      return this.children.find((input) => input.name === 'utm_campaign');
    },
    append(input) { this.children.push(input); },
  };
}

function visit({ referrer = '', url = 'https://www.magic-resume.cn/zh',
  targets = [target()], storage = new Map(), blockedStorage = false } = {}) {
  const listeners = [];
  const document = {
    referrer,
    targets,
    querySelectorAll(selector) {
      assert.equal(selector, '[data-ref-forward]');
      return this.targets;
    },
    createElement(tag) { assert.equal(tag, 'input'); return {}; },
    addEventListener(event, callback) {
      assert.equal(event, 'astro:page-load');
      listeners.push(callback);
    },
  };
  const location = { href: url };
  const context = createContext({
    URL, document, location, window: {},
    get sessionStorage() {
      if (blockedStorage) throw new Error('Storage disabled');
      return {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      };
    },
  });
  runInContext(code, context);
  return { document, location, storage, listeners, context };
}

test('inline script is below 1 KB (uncompressed)', () => {
  assert.ok(Buffer.byteLength(code) < 1000, `${Buffer.byteLength(code)} bytes`);
});

test('external referrer adds a campaign to every marked app link', () => {
  const targets = [target(), target('https://app.magic-resume.cn' + cta)];
  visit({ referrer: 'https://chatgpt.com/c/conversation', targets });
  for (const element of targets) {
    assert.ok(element.attributes.href.endsWith('&utm_campaign=ref.chatgpt.com'));
  }
});

test('inbound utm_source wins over referrer, including without a referrer', () => {
  for (const referrer of ['', 'https://www.google.com/search']) {
    const { document } = visit({ url: 'https://www.magic-resume.cn/zh?utm_source=chatgpt.com', referrer });
    assert.equal(document.targets[0].attributes.href, cta + '&utm_campaign=ref.chatgpt.com');
  }
});

test('own-site referrers and inbound sources do not modify URLs', () => {
  for (const host of ['magic-resume.cn', 'www.magic-resume.cn', 'docs.magic-resume.cn', 'APP.MAGIC-RESUME.CN.']) {
    for (const options of [
      { referrer: `https://${host}/zh` },
      { url: `https://www.magic-resume.cn/zh?utm_source=${host}`, referrer: 'https://chatgpt.com' },
    ]) {
      const { document, storage } = visit(options);
      assert.equal(document.targets[0].attributes.href, cta);
      assert.equal(document.targets[0].writes, 0);
      assert.equal(storage.size, 0);
    }
  }
});

test('a lookalike domain is external', () => {
  const { document } = visit({ referrer: 'https://notmagic-resume.cn' });
  assert.equal(document.targets[0].attributes.href, cta + '&utm_campaign=ref.notmagic-resume.cn');
});

test('no or malformed referrer leaves URLs byte-identical and makes no writes', () => {
  const href = cta + '&prompt=a%20b%2fc+~&extra=1&extra=2#part?x';
  for (const referrer of ['', 'not a URL']) {
    const element = target(href);
    const { storage } = visit({ referrer, targets: [element] });
    assert.equal(element.attributes.href, href);
    assert.equal(element.writes, 0);
    assert.equal(storage.size, 0);
  }
});

test('existing campaigns, even empty or encoded keys, are preserved verbatim', () => {
  for (const campaign of ['utm_campaign=launch', 'utm_campaign=', 'utm%5Fcampaign=launch']) {
    const href = `${cta}&${campaign}#start`;
    const element = target(href);
    visit({ referrer: 'https://chatgpt.com', targets: [element] });
    assert.equal(element.attributes.href, href);
    assert.equal(element.writes, 0);
  }
});

test('other params, encodings, repeated params and fragments are preserved', () => {
  const href = cta + '&prompt=a%20b%2fc+~&extra=1&extra=2';
  const element = target(href + '#section#more');
  visit({ referrer: 'https://chatgpt.com', targets: [element] });
  assert.equal(element.attributes.href, href + '&utm_campaign=ref.chatgpt.com#section#more');
  const params = new URL(element.attributes.href, 'https://app.magic-resume.cn').searchParams;
  assert.equal(params.get('utm_source'), 'landing');
  assert.equal(params.get('utm_medium'), 'cta');
  assert.equal(params.get('utm_content'), 'header');
  assert.equal(params.get('utm_term'), 'zh');
});

test('links with no query insert the campaign before the fragment', () => {
  const element = target('/dashboard#section?question');
  visit({ referrer: 'https://chatgpt.com', targets: [element] });
  assert.equal(element.attributes.href, '/dashboard?utm_campaign=ref.chatgpt.com#section?question');
});

test('source persists across page-load events and duplicate script execution', () => {
  const state = visit({ url: 'https://www.magic-resume.cn/zh?utm_source=chatgpt.com', referrer: 'https://google.com' });
  state.location.href = 'https://www.magic-resume.cn/zh/blog';
  state.document.targets = [target()];
  runInContext(code, state.context);
  assert.equal(state.listeners.length, 1);
  state.listeners[0]();
  state.listeners[0]();
  assert.equal(state.document.targets[0].attributes.href, cta + '&utm_campaign=ref.chatgpt.com');
  assert.equal(state.document.targets[0].writes, 1);
});

test('sessionStorage forwards on a second document with empty or internal referrer', () => {
  const { storage } = visit({ referrer: 'https://chatgpt.com' });
  for (const referrer of ['', 'https://www.magic-resume.cn/zh']) {
    const { document } = visit({ referrer, storage });
    assert.equal(document.targets[0].attributes.href, cta + '&utm_campaign=ref.chatgpt.com');
  }
});

test('blocked sessionStorage does not break forwarding or page transitions', () => {
  const state = visit({ referrer: 'https://chatgpt.com', blockedStorage: true });
  state.document.referrer = '';
  state.document.targets = [target()];
  state.listeners[0]();
  assert.equal(state.document.targets[0].attributes.href, cta + '&utm_campaign=ref.chatgpt.com');
  const direct = visit({ blockedStorage: true });
  assert.equal(direct.document.targets[0].writes, 0);
});

test('hero GET form forwards through a hidden control and preserves existing campaigns', () => {
  const form = target('', 'form');
  const existing = target('', 'form');
  existing.children.push({ name: 'utm_campaign', value: 'launch' });
  const state = visit({ referrer: 'https://chatgpt.com', targets: [form, existing] });
  state.listeners[0]();
  assert.equal(form.children.length, 1);
  assert.equal(form.children[0].type, 'hidden');
  assert.equal(form.children[0].name, 'utm_campaign');
  assert.equal(form.children[0].value, 'ref.chatgpt.com');
  assert.equal(existing.children.length, 1);
  assert.equal(existing.children[0].value, 'launch');
});

test('use-case card URL sources retain attribution when copied to the CTA', () => {
  const card = target(cta + '&prompt=Tailor%20my%20resume', 'data-href');
  visit({ referrer: 'https://chatgpt.com', targets: [card] });
  assert.equal(card.attributes['data-href'], cta + '&prompt=Tailor%20my%20resume&utm_campaign=ref.chatgpt.com');
});
