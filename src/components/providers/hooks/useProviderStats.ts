import { useCallback, useRef, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { monitorApi } from '@/services/api';
import {
  blocksToStatusBarData,
  normalizeUsageSourceId,
  type KeyStatBucket,
  type KeyStats,
  type StatusBarData,
} from '@/utils/usage';

const EMPTY_STATS: KeyStats = { bySource: {}, byAuthIndex: {} };

export const useProviderStats = () => {
  const [keyStats, setKeyStats] = useState<KeyStats>(EMPTY_STATS);
  const [statusBarBySource, setStatusBarBySource] = useState<Map<string, StatusBarData>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);

  const loadKeyStats = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    try {
      const response = await monitorApi.getKeyStats();

      // 归一化 bySource：将后端原始 source key 通过 normalizeUsageSourceId 转换
      const bySource: Record<string, KeyStatBucket> = {};
      const barMap = new Map<string, StatusBarData>();
      const { window_start_ms, duration_ms } = response.block_config;

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

        if (entry.blocks?.length) {
          barMap.set(normalizedId, blocksToStatusBarData(entry.blocks, window_start_ms, duration_ms));
        }
      }

      // byAuthIndex 直接使用
      const byAuthIndex: Record<string, KeyStatBucket> = {};
      for (const [authIndex, entry] of Object.entries(response.by_auth_index)) {
        byAuthIndex[authIndex] = { success: entry.success, failure: entry.failure };
      }

      setKeyStats({ bySource, byAuthIndex });
      setStatusBarBySource(barMap);
    } catch {
      // 静默失败
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // 定时刷新状态数据（每240秒）
  useInterval(loadKeyStats, 240_000);

  return { keyStats, statusBarBySource, loadKeyStats, isLoading };
};
