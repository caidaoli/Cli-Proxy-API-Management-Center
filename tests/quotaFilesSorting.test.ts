import test from 'node:test';
import assert from 'node:assert/strict';
import { sortQuotaFiles } from '../src/components/quota/quotaFiles.ts';
import type { AuthFileItem } from '../src/types/authFile.ts';

const names = (files: AuthFileItem[]) => files.map((file) => file.name);

test('配额管理凭证按渠道优先级降序，同优先级按凭证名称 A-Z 排序', () => {
  const files: AuthFileItem[] = [
    { name: 'zeta.json', priority: 10 },
    { name: 'beta.json', priority: 20 },
    { name: 'alpha.json', priority: 20 },
    { name: 'delta.json' },
    { name: 'gamma.json', priority: 'bad' },
    { name: 'epsilon.json', priority: -1 },
  ];

  assert.deepEqual(names(sortQuotaFiles(files)), [
    'alpha.json',
    'beta.json',
    'zeta.json',
    'delta.json',
    'gamma.json',
    'epsilon.json',
  ]);
});
