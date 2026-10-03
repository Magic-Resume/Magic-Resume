import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import enCopy from '@/locales/en/translation.json';
import type { OrderHistoryRow } from '@/lib/billing/types';
import { OrderHistoryTable } from './OrderHistoryTable';

const i18n = createInstance();
before(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: enCopy } },
    interpolation: { escapeValue: false },
  });
});

const order: OrderHistoryRow = {
  id: 'old-order',
  status: 'paid',
  amountCents: 1900,
  currency: 'CNY',
  channel: 'stripe',
  planName: 'Pro',
  planKind: 'subscription',
  paidAt: '2026-10-03T00:00:00Z',
};
const render = (orders: OrderHistoryRow[]) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(OrderHistoryTable, { orders, loading: false }),
    ),
  );

for (const discountLabel of ['<script>MAGIC20</script>', '<SCRIPT>MAGIC20</SCRIPT>']) {
  test(`settled totals use the channel currency and escape ${discountLabel}`, () => {
    const html = render([
      {
        ...order,
        billingDetails: {
          subtotalCents: 1000,
          discountCents: 200,
          taxCents: 0,
          shippingCents: 0,
          totalCents: 800,
          currency: 'USD',
          discountLabel,
        },
      },
    ]);
    assert.match(html, /\$8\.00/);
    assert.match(html, /Subtotal/);
    assert.match(html, /−\$2\.00/);
    assert.match(html, /Tax/);
    assert.match(html, /&lt;script&gt;MAGIC20&lt;\/script&gt;/i);
    assert.doesNotMatch(html, /<script\b/i);
    assert.doesNotMatch(html, /Shipping/);
    assert.doesNotMatch(html, /19\.00/);
  });
}

test('nonzero shipping is shown from the settled snapshot', () => {
  const html = render([
    {
      ...order,
      billingDetails: {
        subtotalCents: 1000,
        discountCents: 200,
        taxCents: 50,
        shippingCents: 100,
        totalCents: 950,
        currency: 'USD',
      },
    },
  ]);
  assert.match(html, /\$9\.50/);
  assert.match(html, /Shipping/);
  assert.match(html, /\$1\.00/);
  assert.match(html, /\$0\.50/);
});

test('old and pending orders keep their original amount without inventing tax or discount details', () => {
  const html = render([
    order,
    { ...order, id: 'pending', status: 'pending', billingDetails: null },
  ]);
  assert.match(html, /19\.00/);
  assert.doesNotMatch(html, /<details/);
  assert.doesNotMatch(html, /Tax|Discount|Shipping/);
});
