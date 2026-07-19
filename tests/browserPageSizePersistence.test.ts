import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAuthFilesPageSize,
  readAuthFilesUiState,
  writeAuthFilesUiState,
} from '../src/features/authFiles/uiState.ts';
import {
  MAX_QUOTA_PAGE_SIZE,
  readQuotaUiState,
  writeQuotaUiState,
} from '../src/components/quota/uiState.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const installBrowserStorage = () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage, sessionStorage },
  });
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

test('认证文件管理页面单页数量超过 40 时仍可恢复', () => {
  installBrowserStorage();

  writeAuthFilesUiState({ pageSize: 500 });

  assert.equal(readAuthFilesUiState()?.pageSize, 500);
  assert.equal(normalizeAuthFilesPageSize(501), 501);
});

test('认证文件管理页面单页数量仍保留最小值 3', () => {
  installBrowserStorage();

  writeAuthFilesUiState({ pageSize: 2 });

  assert.equal(readAuthFilesUiState()?.pageSize, 3);
});

test('配额管理页面单页数量写入浏览器存储后可恢复', () => {
  installBrowserStorage();

  writeQuotaUiState({ pageSize: 40 });

  assert.equal(readQuotaUiState()?.pageSize, 40);
  assert.equal(MAX_QUOTA_PAGE_SIZE, 40);
});

test('配额管理页面单页数量超过上限时按 40 写入浏览器存储', () => {
  installBrowserStorage();

  writeQuotaUiState({ pageSize: 41 });

  assert.equal(readQuotaUiState()?.pageSize, 40);
});
