import { describe, expect, spyOn, test } from 'bun:test';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';

describe('authFilesApi.patchFieldsBatch', () => {
  test('sends all credential updates in one request', async () => {
    const response = {
      updated: 1,
      failed: [{ name: 'missing.json', error: 'auth file not found' }],
    };
    const patchSpy = spyOn(apiClient, 'patch').mockResolvedValue(response);

    try {
      const result = await authFilesApi.patchFieldsBatch([
        { name: 'first.json', fields: { note: 'updated', priority: 0 } },
        { name: 'missing.json', fields: { websockets: false } },
      ]);

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith('/auth-files/fields/batch', {
        updates: [
          { name: 'first.json', fields: { note: 'updated', priority: 0 } },
          { name: 'missing.json', fields: { websockets: false } },
        ],
      });
      expect(result).toEqual(response);
    } finally {
      patchSpy.mockRestore();
    }
  });
});
