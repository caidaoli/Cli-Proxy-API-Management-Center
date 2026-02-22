import { useMemo } from 'react';
import type { AuthFileItem } from '@/types';
import { EMPTY_STATUS_BAR, normalizeAuthIndex, type StatusBarData } from '@/utils/usage';

export type AuthFileStatusBarData = StatusBarData;

export function useAuthFilesStatusBarCache(
  files: AuthFileItem[],
  statusBarByAuthIndex: Map<string, StatusBarData>
) {
  return useMemo(() => {
    const cache = new Map<string, StatusBarData>();

    files.forEach((file) => {
      const rawAuthIndex = file['auth_index'] ?? file.authIndex;
      const authIndexKey = normalizeAuthIndex(rawAuthIndex);

      if (authIndexKey) {
        cache.set(authIndexKey, statusBarByAuthIndex.get(authIndexKey) || EMPTY_STATUS_BAR);
      }
    });

    return cache;
  }, [files, statusBarByAuthIndex]);
}
