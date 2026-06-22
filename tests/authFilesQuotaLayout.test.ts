import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const cssRule = (source: string, selector: string): string => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${selector} rule should exist`);
  return match[1];
};

test('认证文件 Codex 计划信息行跟配额管理一样允许换行', () => {
  const authFilesStyles = readProjectFile('src/pages/AuthFilesPage.module.scss');
  const quotaStyles = readProjectFile('src/pages/QuotaPage.module.scss');

  assert.match(cssRule(quotaStyles, '.codexPlan'), /flex-wrap:\s*wrap;/);
  assert.match(cssRule(authFilesStyles, '.codexPlan'), /flex-wrap:\s*wrap;/);
});
