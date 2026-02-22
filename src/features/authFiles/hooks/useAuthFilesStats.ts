import { useCallback, useRef, useState } from 'react';
import { monitorApi } from '@/services/api';
import {
  blocksToStatusBarData,
  normalizeUsageSourceId,
  type KeyStatBucket,
  type KeyStats,
  type StatusBarData,
} from '@/utils/usage';

export type UseAuthFilesStatsResult = {
  keyStats: KeyStats;
  statusBarByAuthIndex: Map<string, StatusBarData>;
  loadKeyStats: () => Promise<void>;
};

export function useAuthFilesStats(): UseAuthFilesStatsResult {
  const [keyStats, setKeyStats] = useState<KeyStats>({ bySource: {}, byAuthIndex: {} });
  const [statusBarByAuthIndex, setStatusBarByAuthIndex] = useState<Map<string, StatusBarData>>(new Map());
  const loadingKeyStatsRef = useRef(false);

  const loadKeyStats = useCallback(async () => {
    if (loadingKeyStatsRef.current) return;
    loadingKeyStatsRef.current = true;
    try {
      const response = await monitorApi.getKeyStats();
      const { window_start_ms, duration_ms } = response.block_config;

      // 归一化 bySource
      const bySource: Record<string, KeyStatBucket> = {};
      for (const [rawSource, entry] of Object.entries(response.by_source)) {
        const normalizedId = normalizeUsageSourceId(rawSource);
        if (!normalizedId) continue;
        const existing = bySource[normalizedId];
        if (existing) {
          existing.success += entry.success;
          existing.failure += entry.failure;
        } else {
          bySource[normalizedId] = { success: entry.success, failure: entry.failure };
        }
      }

      // byAuthIndex 直接使用
      const byAuthIndex: Record<string, KeyStatBucket> = {};
      const barMap = new Map<string, StatusBarData>();
      for (const [authIndex, entry] of Object.entries(response.by_auth_index)) {
        byAuthIndex[authIndex] = { success: entry.success, failure: entry.failure };
        if (entry.blocks?.length) {
          barMap.set(authIndex, blocksToStatusBarData(entry.blocks, window_start_ms, duration_ms));
        }
      }

      setKeyStats({ bySource, byAuthIndex });
      setStatusBarByAuthIndex(barMap);
    } catch {
      // 静默失败
    } finally {
      loadingKeyStatsRef.current = false;
    }
  }, []);

  return { keyStats, statusBarByAuthIndex, loadKeyStats };
}
