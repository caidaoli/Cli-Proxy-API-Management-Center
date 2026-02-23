import { useMemo } from 'react';
import type { AuthFileItem } from '@/types';
import { EMPTY_STATUS_BAR, type StatusBarData } from '@/utils/usage';
import { normalizeAuthIndexValue } from '@/features/authFiles/constants';

export type AuthFileStatusBarData = StatusBarData;

export function useAuthFilesStatusBarCache(
  files: AuthFileItem[],
  statusBarByAuthIndex: Map<string, StatusBarData>
) {
  return useMemo(() => {
    const cache = new Map<string, StatusBarData>();

    files.forEach((file) => {
      const rawAuthIndex = file['auth_index'] ?? file.authIndex;
      const authIndexKey = normalizeAuthIndexValue(rawAuthIndex);

      if (authIndexKey) {
        cache.set(authIndexKey, statusBarByAuthIndex.get(authIndexKey) || EMPTY_STATUS_BAR);
      }
    });

    return cache;
  }, [files, statusBarByAuthIndex]);
}
