import { describe, expect, test } from 'bun:test';
import type { AuthFileItem } from '@/types';
import {
  removeSelectedAuthFiles,
  selectAuthFiles,
  toggleAuthFileSelection,
  type AuthFileSelection,
} from '@/features/authFiles/selection';

const file = (name: string, disabled = false): AuthFileItem => ({ name, disabled });

describe('auth-file cross-page selection', () => {
  test('keeps earlier page selections when selecting another page', () => {
    const pageOne = selectAuthFiles(new Map(), [file('a.json'), file('b.json', true)]);
    const pageTwo = selectAuthFiles(pageOne, [file('c.json')]);

    expect(Array.from(pageTwo.keys())).toEqual(['a.json', 'b.json', 'c.json']);
    expect(pageTwo.get('b.json')).toEqual({ disabled: true });
  });

  test('toggles one file without mutating the previous selection', () => {
    const original: AuthFileSelection = new Map([['a.json', { disabled: false }]]);
    const added = toggleAuthFileSelection(original, file('b.json', true));
    const removed = toggleAuthFileSelection(added, file('a.json'));

    expect(Array.from(original.keys())).toEqual(['a.json']);
    expect(added.get('b.json')).toEqual({ disabled: true });
    expect(Array.from(removed.keys())).toEqual(['b.json']);
  });

  test('removes only successfully deleted names', () => {
    const selected = selectAuthFiles(new Map(), [file('a.json'), file('b.json'), file('c.json')]);

    const next = removeSelectedAuthFiles(selected, ['a.json', 'c.json']);

    expect(Array.from(next.keys())).toEqual(['b.json']);
  });
});
