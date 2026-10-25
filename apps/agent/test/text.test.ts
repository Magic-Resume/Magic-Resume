import assert from 'node:assert/strict';
import test from 'node:test';
import { stripTags } from '../src/text.js';

test('stripTags leaves no complete tag behind', () => {
  for (const input of [
    '<scr<b>ipt>alert(1)</script>',
    '<<i>script>x<</i>/script>',
  ])
    assert.doesNotMatch(stripTags(input), /<[^>]*>/);
  assert.equal(stripTags('<p>Alex <b>Chen</b></p>'), 'Alex Chen');
  assert.equal(stripTags('<li>One</li><li>Two</li>', ' ').trim(), 'One  Two');
  assert.equal(stripTags('5 < 6 and 7 > 3'), '5  3');
});
