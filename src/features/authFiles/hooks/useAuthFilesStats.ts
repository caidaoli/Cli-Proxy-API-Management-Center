import { useCallback, useRef, useState } from 'react';
import { monitorApi, type MonitorKeyStatsResponse } from '@/services/api/monitor';
import type { AuthFileItem } from '@/types';
import {
  blocksToStatusBarData,
  normalizeAuthIndex,
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

const getAuthIndexes = (files: AuthFileItem[]): string[] => {
  const indexes = new Set<string>();
  files.forEach((file) => {
    const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
    if (authIndex) indexes.add(authIndex);
  });
  return Array.from(indexes);
};

export type UseAuthFilesStatsResult = {
  keyStats: KeyStats;
  statusBarByAuthIndex: Map<string, StatusBarData>;
  loadKeyStatsForFiles: (files: AuthFileItem[]) => Promise<void>;
  refreshKeyStatsForFiles: (files: AuthFileItem[]) => Promise<void>;
  refreshKeyStatsForAuthIndex: (authIndex: unknown) => Promise<void>;
};

export function useAuthFilesStats(): UseAuthFilesStatsResult {
  const [keyStats, setKeyStats] = useState<KeyStats>(EMPTY_KEY_STATS);
  const [statusBarByAuthIndex, setStatusBarByAuthIndex] = useState<Map<string, StatusBarData>>(
    () => new Map()
  );
  const lastRequestRef = useRef<{ signature: string; refreshedAt: number } | null>(null);
  const batchRequestIdRef = useRef(0);

  const requestKeyStatsForFiles = useCallback(async (files: AuthFileItem[], force: boolean) => {
    const authIndexes = getAuthIndexes(files);
    const signature = authIndexes.join('\u0000');
    const lastRequest = lastRequestRef.current;
    if (
      !force &&
      lastRequest?.signature === signature &&
      Date.now() - lastRequest.refreshedAt < STALE_TIME_MS
    ) {
      return;
    }

    const requestId = ++batchRequestIdRef.current;
    if (lastRequest?.signature !== signature) {
      setKeyStats(EMPTY_KEY_STATS);
      setStatusBarByAuthIndex(new Map());
    }

    if (authIndexes.length === 0) {
      lastRequestRef.current = { signature, refreshedAt: Date.now() };
      return;
    }

    try {
      const response = await monitorApi.getKeyStats(authIndexes);
      if (requestId !== batchRequestIdRef.current) return;
      const result = processKeyStatsResponse(response);
      setKeyStats(result.keyStats);
      setStatusBarByAuthIndex(result.statusBarByAuthIndex);
      lastRequestRef.current = { signature, refreshedAt: Date.now() };
    } catch {
      // Statistics are non-blocking for the file list.
    }
  }, []);

  const loadKeyStatsForFiles = useCallback(
    (files: AuthFileItem[]) => requestKeyStatsForFiles(files, false),
    [requestKeyStatsForFiles]
  );

  const refreshKeyStatsForFiles = useCallback(
    (files: AuthFileItem[]) => requestKeyStatsForFiles(files, true),
    [requestKeyStatsForFiles]
  );

  const refreshKeyStatsForAuthIndex = useCallback(async (authIndex: unknown) => {
    const normalizedAuthIndex = normalizeAuthIndex(authIndex);
    if (!normalizedAuthIndex) {
      return;
    }

    try {
      const response = await monitorApi.getKeyStats({ auth_index: normalizedAuthIndex });
      if (normalizeAuthIndex(response.filter?.auth_index) !== normalizedAuthIndex) {
        return;
      }

      const result = processKeyStatsResponse(response);
      const nextStats = result.keyStats.byAuthIndex[normalizedAuthIndex];
      const nextStatusBar = result.statusBarByAuthIndex.get(normalizedAuthIndex);
      const emptyStatusBar = blocksToStatusBarData(
        Array.from({ length: response.block_config.count }, () => ({ success: 0, failure: 0 })),
        response.block_config.window_start_ms,
        response.block_config.duration_ms
      );

      setKeyStats((prev) => {
        const byAuthIndex = { ...prev.byAuthIndex };
        byAuthIndex[normalizedAuthIndex] = nextStats ?? { success: 0, failure: 0 };
        return { bySource: prev.bySource, byAuthIndex };
      });

      setStatusBarByAuthIndex((prev) => {
        const next = new Map(prev);
        next.set(normalizedAuthIndex, nextStatusBar ?? emptyStatusBar);
        return next;
      });
    } catch {
      // Statistics are non-blocking for the file list.
    }
  }, []);

  return {
    keyStats,
    statusBarByAuthIndex,
    loadKeyStatsForFiles,
    refreshKeyStatsForFiles,
    refreshKeyStatsForAuthIndex,
  };
}
