import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const constantsSource = readFileSync(
  new URL('../src/features/authFiles/constants.ts', import.meta.url),
  'utf8'
);

test('Codex 认证文件读取同时兼容 websocket 旧字段和 websockets 新字段', () => {
  assert.match(
    constantsSource,
    /parseDisableCoolingValue\(value\.websockets\s*\?\?\s*value\.websocket\)\s*\?\?\s*false/
  );
});

test('保存 Codex 认证文件时移除 websocket 旧字段，只写 websockets', () => {
  assert.match(constantsSource, /delete next\.websocket;/);
  assert.match(constantsSource, /next\.websockets = websockets;/);
});
