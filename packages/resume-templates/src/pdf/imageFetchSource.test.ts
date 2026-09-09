import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfImageFetchSource } from './imageFetchSource';

test('Brandfetch v3 的 R2 logo 改走同源 PDF 图片代理', () => {
  const src =
    'https://pub-ca5e6f293e274c1b9298cf78d112e0be.r2.dev/logos/brandfetch-v3/tencent.com.svg';
  assert.equal(pdfImageFetchSource(src), `/api/pdf/logo-image?src=${encodeURIComponent(src)}`);
});

test('Brandfetch v4 的候选 logo 同样改走同源 PDF 图片代理', () => {
  const src =
    'https://pub-ca5e6f293e274c1b9298cf78d112e0be.r2.dev/logos/brandfetch-v4/tencent.com/logo-light-abcd.svg';
  assert.equal(pdfImageFetchSource(src), `/api/pdf/logo-image?src=${encodeURIComponent(src)}`);
});

test('非版本化 logo 与任意远程图片保持原路径', () => {
  const oldLogo =
    'https://pub-ca5e6f293e274c1b9298cf78d112e0be.r2.dev/logos/brandfetch/tencent.com.jpg';
  const other = 'https://cdn.example.com/logo.svg';
  assert.equal(pdfImageFetchSource(oldLogo), oldLogo);
  assert.equal(pdfImageFetchSource(other), other);
});
