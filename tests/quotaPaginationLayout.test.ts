import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('配额管理默认每页 12 个凭证，显示全部使用过多提示阈值作为单页数量', () => {
  const source = readProjectFile('src/components/quota/QuotaSection.tsx');

  assert.match(source, /const DEFAULT_QUOTA_PAGE_SIZE = 12;/);
  assert.match(source, /const MAX_SHOW_ALL_THRESHOLD = 30;/);
  assert.match(source, /useQuotaPagination\(filteredFiles,\s*DEFAULT_QUOTA_PAGE_SIZE\)/);
  assert.match(source, /setPageSize\(MAX_SHOW_ALL_THRESHOLD\)/);
  assert.doesNotMatch(source, /columns\s*\*\s*3/);
});

test('配额管理分页导航显示当前单页数量', () => {
  const source = readProjectFile('src/components/quota/QuotaSection.tsx');

  assert.match(source, /auth_files\.page_size_label/);
  assert.match(source, /type="number"/);
  assert.match(source, /value=\{pageSizeInput\}/);
  assert.match(source, /onChange=\{\(event\) => setPageSizeInput\(event\.target\.value\)\}/);
  assert.match(source, /onBlur=\{applyPageSizeInput\}/);
  assert.match(source, /onKeyDown=\{handlePageSizeInputKeyDown\}/);
  assert.doesNotMatch(source, /}：\{pageSize\}/);
});

test('配额管理单页数量输入限制在 1 到显示全部上限之间', () => {
  const source = readProjectFile('src/components/quota/QuotaSection.tsx');

  assert.match(source, /const MIN_QUOTA_PAGE_SIZE = 1;/);
  assert.match(source, /const normalizeQuotaPageSize = \(value: string \| number\): number =>/);
  assert.match(source, /Math\.min\(MAX_SHOW_ALL_THRESHOLD,\s*Math\.max\(MIN_QUOTA_PAGE_SIZE,\s*parsed\)\)/);
  assert.match(source, /min=\{MIN_QUOTA_PAGE_SIZE\}/);
  assert.match(source, /max=\{MAX_SHOW_ALL_THRESHOLD\}/);
});

test('配额管理显示全部时把单页数量输入同步为显示全部上限', () => {
  const source = readProjectFile('src/components/quota/QuotaSection.tsx');

  assert.match(source, /const applyShowAllPageSize = useCallback\(\(\) =>/);
  assert.match(source, /setPageSize\(MAX_SHOW_ALL_THRESHOLD\);[\s\S]*?setPageSizeInput\(String\(MAX_SHOW_ALL_THRESHOLD\)\);/);
  assert.match(source, /filteredFiles\.length > MAX_SHOW_ALL_THRESHOLD\) \{[\s\S]*?applyShowAllPageSize\(\);[\s\S]*?setShowTooManyWarning\(true\);/);
});

test('配额管理凭证网格使用四列宽度', () => {
  const styles = readProjectFile('src/pages/QuotaPage.module.scss');

  assert.match(styles, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(280px,\s*1fr\)\);/);
});

test('配额管理分页导航允许换行', () => {
  const styles = readProjectFile('src/pages/QuotaPage.module.scss');

  assert.match(styles, /\.pagination\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
});
