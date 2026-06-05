import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const snippetAround = (source: string, marker: string, radius = 420): string => {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, marker);
  return source.slice(Math.max(0, index - radius), index + marker.length + radius);
};

const assertPasswordManagerIgnored = (snippet: string, label: string) => {
  assert.match(snippet, /autoComplete="new-password"/, label);
  assert.match(snippet, /data-1p-ignore="true"/, label);
  assert.match(snippet, /data-lpignore="true"/, label);
  assert.match(snippet, /data-bwignore="true"/, label);
};

test('登录管理密钥使用稳定字段名和当前密码 autocomplete', () => {
  const source = readProjectFile('src/pages/LoginPage.tsx');
  const snippet = snippetAround(source, 'value={managementKey}');

  assert.match(snippet, /name="cpa-management-key"/);
  assert.match(snippet, /autoComplete="current-password"/);
});

test('AI provider API key 输入禁用浏览器和密码管理器自动填充', () => {
  const cases = [
    ['src/pages/AiProvidersGeminiEditPage.tsx', 'value={form.apiKey}'],
    ['src/pages/AiProvidersCodexEditPage.tsx', 'value={form.apiKey}'],
    ['src/pages/AiProvidersClaudeEditPage.tsx', 'value={form.apiKey}'],
    ['src/pages/AiProvidersVertexEditPage.tsx', 'value={form.apiKey}'],
    ['src/pages/AiProvidersOpenAIEditPage.tsx', 'value={entry.apiKey}'],
    ['src/pages/AiProvidersAmpcodeEditPage.tsx', 'value={form.upstreamApiKey}'],
    ['src/pages/AiProvidersAmpcodeEditPage.tsx', 'value={entry.upstreamApiKey}'],
  ] as const;

  for (const [path, marker] of cases) {
    assertPasswordManagerIgnored(snippetAround(readProjectFile(path), marker), `${path}: ${marker}`);
  }
});
