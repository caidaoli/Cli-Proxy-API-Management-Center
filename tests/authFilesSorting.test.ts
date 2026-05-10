import test from 'node:test';
import assert from 'node:assert/strict';
import { sortAuthFilesByMode } from '../src/features/authFiles/sorting.ts';
import type { AuthFileItem } from '../src/types/authFile.ts';

const names = (files: AuthFileItem[]) => files.map((file) => file.name);

test('认证文件默认排序按优先级降序，同优先级按名称 A-Z', () => {
  const files: AuthFileItem[] = [
    { name: 'zeta.json', priority: 10 },
    { name: 'beta.json', priority: 20 },
    { name: 'alpha.json', priority: 20 },
    { name: 'delta.json' },
    { name: 'gamma.json', priority: 'bad' },
    { name: 'epsilon.json', priority: -1 },
  ];

  assert.deepEqual(names(sortAuthFilesByMode(files, 'default')), [
    'alpha.json',
    'beta.json',
    'zeta.json',
    'delta.json',
    'gamma.json',
    'epsilon.json',
  ]);
});

test('认证文件优先级排序也用名称兜底，避免同优先级顺序抖动', () => {
  const files: AuthFileItem[] = [
    { name: 'b.json', priority: 5 },
    { name: 'a.json', priority: 5 },
    { name: 'c.json', priority: 4 },
  ];

  assert.deepEqual(names(sortAuthFilesByMode(files, 'priority')), ['a.json', 'b.json', 'c.json']);
});
