import test from 'node:test';
import assert from 'node:assert/strict';

import { formatWalletAddress } from '../src/wallet/phantom.js';

test('formatWalletAddress returns trimmed address when it is short', () => {
  const address = '   ABCDEFG  ';
  assert.equal(formatWalletAddress(address), 'ABCDEFG');
});

test('formatWalletAddress elides middle characters with default segment length', () => {
  const address = 'ABCDEFGH12345678';
  assert.equal(formatWalletAddress(address), 'ABCD…5678');
});

test('formatWalletAddress falls back to default segment length for invalid input', () => {
  const address = 'ABCDEFGH12345678';
  const withNegative = formatWalletAddress(address, { segmentLength: -2 });
  const withZero = formatWalletAddress(address, { segmentLength: 0 });
  assert.equal(withNegative, 'ABCD…5678');
  assert.equal(withZero, 'ABCD…5678');
});

test('formatWalletAddress honours sanitized custom segment length', () => {
  const address = 'ABCDEFGH12345678';
  const formatted = formatWalletAddress(address, { segmentLength: '2.7' });
  assert.equal(formatted, 'AB…78');
});

test('formatWalletAddress returns empty string for unsupported input', () => {
  assert.equal(formatWalletAddress(null), '');
  assert.equal(formatWalletAddress('   '), '');
});
