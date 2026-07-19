import { describe, expect, test } from 'bun:test';
import type { AuthFileFieldsPatch } from '@/services/api/authFiles';
import {
  buildBatchAuthFileFieldsUpdates,
  buildBatchAuthFileFieldsPatch,
  createEmptyBatchFieldsForm,
  filterPatchForFile,
  resolveAuthFileProviderKey,
  type BatchFieldsFormState,
} from '@/features/authFiles/batchFieldsPatch';

const touch = (partial: Partial<BatchFieldsFormState>): BatchFieldsFormState => ({
  ...createEmptyBatchFieldsForm(),
  ...partial,
});

describe('buildBatchAuthFileFieldsPatch', () => {
  test('returns empty patch when nothing is touched', () => {
    const { patch, errorKey } = buildBatchAuthFileFieldsPatch(createEmptyBatchFieldsForm());
    expect(errorKey).toBeNull();
    expect(patch).toEqual({});
  });

  test('includes only touched text fields, allowing empty clear values', () => {
    const { patch, errorKey } = buildBatchAuthFileFieldsPatch(
      touch({
        prefix: '  p1  ',
        prefixTouched: true,
        proxyUrl: '',
        proxyUrlTouched: true,
        note: '  hello ',
        noteTouched: true,
      })
    );
    expect(errorKey).toBeNull();
    expect(patch).toEqual({
      prefix: 'p1',
      proxy_url: '',
      note: 'hello',
    });
  });

  test('rejects non-empty invalid priority', () => {
    const { patch, errorKey } = buildBatchAuthFileFieldsPatch(
      touch({ priority: '1.5', priorityTouched: true })
    );
    expect(errorKey).toBe('auth_files.batch_fields_priority_invalid');
    expect(patch).toEqual({});
  });

  test('writes valid priority integers including zero only when touched and non-empty', () => {
    expect(
      buildBatchAuthFileFieldsPatch(touch({ priority: '0', priorityTouched: true })).patch
    ).toEqual({ priority: 0 });
    expect(
      buildBatchAuthFileFieldsPatch(touch({ priority: '99', priorityTouched: true })).patch
    ).toEqual({ priority: 99 });
    expect(
      buildBatchAuthFileFieldsPatch(touch({ priority: '', priorityTouched: true })).patch
    ).toEqual({});
  });

  test('writes excluded_models when touched, including empty clear', () => {
    expect(
      buildBatchAuthFileFieldsPatch(
        touch({ excludedModelsText: 'A, b\nb', excludedModelsTouched: true })
      ).patch.excluded_models
    ).toEqual(['a', 'b']);
    expect(
      buildBatchAuthFileFieldsPatch(
        touch({ excludedModelsText: '  ', excludedModelsTouched: true })
      ).patch
    ).toEqual({ excluded_models: [] });
  });

  test('parses headers object and rejects invalid JSON', () => {
    const ok = buildBatchAuthFileFieldsPatch(
      touch({
        headersText: '{"X-A":"1"}',
        headersTouched: true,
      })
    );
    expect(ok.errorKey).toBeNull();
    expect(ok.patch.headers).toEqual({ 'X-A': '1' });

    const bad = buildBatchAuthFileFieldsPatch(touch({ headersText: '{', headersTouched: true }));
    expect(bad.errorKey).toBe('auth_files.headers_invalid_json');

    const emptyTouched = buildBatchAuthFileFieldsPatch(
      touch({ headersText: '  ', headersTouched: true })
    );
    expect(emptyTouched.errorKey).toBeNull();
    expect(emptyTouched.patch.headers).toBeUndefined();
  });

  test('disableCooling and toggles only write when applied/touched', () => {
    expect(buildBatchAuthFileFieldsPatch(touch({ disableCooling: 'unchanged' })).patch).toEqual({});
    expect(buildBatchAuthFileFieldsPatch(touch({ disableCooling: 'true' })).patch).toEqual({
      disable_cooling: true,
    });
    expect(buildBatchAuthFileFieldsPatch(touch({ disableCooling: 'false' })).patch).toEqual({
      disable_cooling: false,
    });
    expect(
      buildBatchAuthFileFieldsPatch(touch({ websockets: true, websocketsTouched: false })).patch
    ).toEqual({});
    expect(
      buildBatchAuthFileFieldsPatch(touch({ websockets: true, websocketsTouched: true })).patch
    ).toEqual({ websockets: true });
    expect(
      buildBatchAuthFileFieldsPatch(touch({ usingApi: true, usingApiTouched: true })).patch
    ).toEqual({ using_api: true });
  });
});

describe('filterPatchForFile / resolveAuthFileProviderKey', () => {
  test('resolves provider key preferring type when it supports specialty fields', () => {
    expect(resolveAuthFileProviderKey({ type: 'xai', provider: 'other' })).toBe('xai');
    expect(resolveAuthFileProviderKey({ type: 'claude', provider: 'xai' })).toBe('xai');
  });

  test('strips unsupported specialty fields per file', () => {
    const base: AuthFileFieldsPatch = {
      prefix: 'p',
      websockets: true,
      using_api: true,
    };
    expect(filterPatchForFile(base, 'codex')).toEqual({
      prefix: 'p',
      websockets: true,
    });
    expect(filterPatchForFile(base, 'xai')).toEqual({
      prefix: 'p',
      websockets: true,
      using_api: true,
    });
    expect(filterPatchForFile(base, 'claude')).toEqual({ prefix: 'p' });
  });

  test('builds provider-specific batch updates and counts local skips', () => {
    const result = buildBatchAuthFileFieldsUpdates(
      [
        { name: 'codex.json', type: 'codex' },
        { name: 'xai.json', type: 'xai' },
        { name: 'claude.json', type: 'claude' },
      ],
      { websockets: true, using_api: true }
    );

    expect(result).toEqual({
      updates: [
        { name: 'codex.json', fields: { websockets: true } },
        { name: 'xai.json', fields: { websockets: true, using_api: true } },
      ],
      skippedCount: 1,
    });
  });
});
