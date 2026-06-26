import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const connectionSource = readFileSync(
  new URL('../src/utils/connection.ts', import.meta.url),
  'utf8'
);

test('本地 Vite 5173 页面自动探测后端管理端口 8317', () => {
  assert.match(connectionSource, /port\s*===\s*['"]5173['"]/);
  assert.match(connectionSource, /DEFAULT_API_PORT/);
  assert.match(connectionSource, /isLocalhost\(hostname\)[\s\S]*DEFAULT_API_PORT/);
});
