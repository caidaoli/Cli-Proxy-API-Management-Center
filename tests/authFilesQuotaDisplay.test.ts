import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisibleAuthFileQuotaType } from '../src/features/authFiles/quotaDisplay.ts';
import type { AuthFileItem } from '../src/types/authFile.ts';

test('认证文件默认全部筛选时也展示文件自身的额度刷新入口', () => {
  const file: AuthFileItem = { name: 'antigravity-user.json', type: 'antigravity' };

  assert.equal(resolveVisibleAuthFileQuotaType(file, null), 'antigravity');
});

test('认证文件选中具体额度类型时只展示匹配类型的额度入口', () => {
  const file: AuthFileItem = { name: 'codex-user.json', type: 'codex' };

  assert.equal(resolveVisibleAuthFileQuotaType(file, 'codex'), 'codex');
  assert.equal(resolveVisibleAuthFileQuotaType(file, 'antigravity'), null);
});

test('认证文件非额度类型在全部筛选时不展示额度入口', () => {
  const file: AuthFileItem = { name: 'qwen-user.json', type: 'qwen' };

  assert.equal(resolveVisibleAuthFileQuotaType(file, null), null);
});
