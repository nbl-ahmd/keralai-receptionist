import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from '../lib/auth/redirect';
test('login redirects remain same origin after browser normalization', () => {
  for (const value of [null, 'https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil.test', '/\t/evil.test']) assert.equal(safeNext(value), '/dashboard');
  assert.equal(safeNext('/admin/workspaces?filter=vobiz#account'), '/admin/workspaces?filter=vobiz#account');
  assert.equal(safeNext('/dashboard#calls'), '/dashboard#calls');
});
