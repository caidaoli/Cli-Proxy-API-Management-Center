import { useCallback, useRef, useState } from 'react';
import { monitorApi, type MonitorKeyStatsResponse } from '@/services/api/monitor';
import {
  blocksToStatusBarData,
  type KeyStats,
  type StatusBarData,
} from '@/utils/usage';

const STALE_TIME_MS = 240_000;

const EMPTY_KEY_STATS: KeyStats = { bySource: {}, byAuthIndex: {} };

function processKeyStatsResponse(response: MonitorKeyStatsResponse) {
  const { by_source, by_auth_index, block_config } = response;

  const bySource: Record<string, { success: number; failure: number }> = {};
  const byAuthIndex: Record<string, { success: number; failure: number }> = {};
  const statusBarByAuthIndex = new Map<string, StatusBarData>();

  for (const [key, entry] of Object.entries(by_source)) {
    bySource[key] = { success: entry.success, failure: entry.failure };
  }
  for (const [key, entry] of Object.entries(by_auth_index)) {
    byAuthIndex[key] = { success: entry.success, failure: entry.failure };
    statusBarByAuthIndex.set(
      key,
      blocksToStatusBarData(entry.blocks, block_config.window_start_ms, block_config.duration_ms)
    );
  }

  return {
    keyStats: { bySource, byAuthIndex } as KeyStats,
    statusBarByAuthIndex,
  };
}

export type UseAuthFilesStatsResult = {
  keyStats: KeyStats;
  statusBarByAuthIndex: Map<string, StatusBarData>;
  loadKeyStats: () => Promise<void>;
  refreshKeyStats: () => Promise<void>;
};

export function useAuthFilesStats(): UseAuthFilesStatsResult {
  const [keyStats, setKeyStats] = useState<KeyStats>(EMPTY_KEY_STATS);
  const [statusBarByAuthIndex, setStatusBarByAuthIndex] = useState<Map<string, StatusBarData>>(
    () => new Map()
  );
  const lastRefreshedAt = useRef<number | null>(null);

  const loadKeyStats = useCallback(async () => {
    if (lastRefreshedAt.current && Date.now() - lastRefreshedAt.current < STALE_TIME_MS) {
      return;
    }
    try {
      const response = await monitorApi.getKeyStats();
      const result = processKeyStatsResponse(response);
      setKeyStats(result.keyStats);
      setStatusBarByAuthIndex(result.statusBarByAuthIndex);
      lastRefreshedAt.current = Date.now();
    } catch {
      // silent
    }
  }, []);

  const refreshKeyStats = useCallback(async () => {
    try {
      const response = await monitorApi.getKeyStats();
      const result = processKeyStatsResponse(response);
      setKeyStats(result.keyStats);
      setStatusBarByAuthIndex(result.statusBarByAuthIndex);
      lastRefreshedAt.current = Date.now();
    } catch {
      // silent
    }
  }, []);

  return { keyStats, statusBarByAuthIndex, loadKeyStats, refreshKeyStats };
}
