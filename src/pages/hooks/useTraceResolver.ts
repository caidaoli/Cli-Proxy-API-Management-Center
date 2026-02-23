import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api/authFiles';
import { monitorApi, type MonitorRequestDetailItem } from '@/services/api/monitor';
import type { AuthFileItem, Config } from '@/types';
import type { CredentialInfo, SourceInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import { normalizeAuthIndex } from '@/utils/usage';
import type { ParsedLogLine } from './logTypes';

type TraceDetail = MonitorRequestDetailItem & { __timestampMs: number };

export type TraceCandidate = {
  detail: TraceDetail;
  modelMatched: boolean;
  timeDeltaMs: number | null;
};

const TRACE_CACHE_MS = 60 * 1000;
const TRACE_MAX_CANDIDATES = 5;

const TRACEABLE_EXACT_PATHS = new Set(['/v1/chat/completions', '/v1/messages', '/v1/responses']);
const TRACEABLE_PREFIX_PATHS = ['/v1beta/models'];

const normalizeTracePath = (value?: string) =>
  String(value ?? '')
    .replace(/^"+|"+$/g, '')
    .split('?')[0]
    .trim();

const normalizeTraceablePath = (value?: string): string => {
  const normalized = normalizeTracePath(value);
  if (!normalized || normalized === '/') return normalized;
  return normalized.replace(/\/+$/, '');
};

export const isTraceableRequestPath = (value?: string): boolean => {
  const normalizedPath = normalizeTraceablePath(value);
  if (!normalizedPath) return false;
  if (TRACEABLE_EXACT_PATHS.has(normalizedPath)) return true;
  return TRACEABLE_PREFIX_PATHS.some((prefix) => normalizedPath.startsWith(prefix));
};

const MODEL_EXTRACT_REGEX = /\bmodel[=:]\s*"?([a-zA-Z0-9._\-/]+)"?/i;

const extractModelFromMessage = (message?: string): string | undefined => {
  if (!message) return undefined;
  const match = message.match(MODEL_EXTRACT_REGEX);
  return match?.[1] || undefined;
};

const isPathMatch = (logPath: string, detailPath: string): boolean => {
  if (!logPath || !detailPath) return false;
  return logPath === detailPath || logPath.startsWith(detailPath) || detailPath.startsWith(logPath);
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err !== 'object' || err === null) return '';
  if (!('message' in err)) return '';

  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
};

interface UseTraceResolverOptions {
  traceScopeKey: string;
  connectionStatus: string;
  config: Config | null;
  requestLogDownloading: boolean;
}

interface UseTraceResolverReturn {
  traceLogLine: ParsedLogLine | null;
  traceLoading: boolean;
  traceError: string;
  traceCandidates: TraceCandidate[];
  resolveTraceSourceInfo: (sourceRaw: string, authIndex: unknown) => SourceInfo;
  loadTraceUsageDetails: () => Promise<void>;
  refreshTraceUsageDetails: () => Promise<void>;
  openTraceModal: (line: ParsedLogLine) => void;
  closeTraceModal: () => void;
}

export function useTraceResolver(options: UseTraceResolverOptions): UseTraceResolverReturn {
  const { traceScopeKey, connectionStatus, config, requestLogDownloading } = options;
  const { t } = useTranslation();

  const [traceLogLine, setTraceLogLine] = useState<ParsedLogLine | null>(null);
  const [traceUsageDetails, setTraceUsageDetails] = useState<TraceDetail[]>([]);
  const [traceAuthFileMap, setTraceAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState('');

  const traceUsageLoadedAtRef = useRef(0);
  const traceAuthLoadedAtRef = useRef(0);
  const traceScopeKeyRef = useRef('');

  const traceSourceInfoMap = useMemo(() => buildSourceInfoMap(config ?? {}), [config]);

  const loadTraceUsageDetailsInternal = useCallback(async (force: boolean) => {
    if (traceScopeKeyRef.current !== traceScopeKey) {
      traceScopeKeyRef.current = traceScopeKey;
      traceUsageLoadedAtRef.current = 0;
      traceAuthLoadedAtRef.current = 0;
      setTraceUsageDetails([]);
      setTraceAuthFileMap(new Map());
      setTraceError('');
    }

    if (traceLoading) return;

    const now = Date.now();
    const usageFresh = !force &&
      traceUsageLoadedAtRef.current > 0 && now - traceUsageLoadedAtRef.current < TRACE_CACHE_MS;
    const authFresh =
      traceAuthLoadedAtRef.current > 0 && now - traceAuthLoadedAtRef.current < TRACE_CACHE_MS;
    if (usageFresh && authFresh) return;

    setTraceLoading(true);
    setTraceError('');
    try {
      const [detailsResponse, authFilesResponse] = await Promise.all([
        usageFresh ? Promise.resolve(null) : monitorApi.getRequestDetails(),
        authFresh ? Promise.resolve(null) : authFilesApi.list().catch(() => null)
      ]);

      if (detailsResponse !== null) {
        const items = detailsResponse?.items ?? [];
        const details: TraceDetail[] = items.map((item) => {
          const ts = item.timestamp ? Date.parse(item.timestamp) : 0;
          return { ...item, __timestampMs: Number.isNaN(ts) ? 0 : ts };
        });
        setTraceUsageDetails(details);
        traceUsageLoadedAtRef.current = Date.now();
      }

      if (authFilesResponse !== null) {
        const files = Array.isArray(authFilesResponse)
          ? authFilesResponse
          : (authFilesResponse as { files?: AuthFileItem[] })?.files;
        if (Array.isArray(files)) {
          const map = new Map<string, CredentialInfo>();
          files.forEach((file) => {
            const key = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
            if (!key) return;
            map.set(key, {
              name: file.name || key,
              type: (file.type || file.provider || '').toString()
            });
          });
          setTraceAuthFileMap(map);
          traceAuthLoadedAtRef.current = Date.now();
        }
      }
    } catch (err: unknown) {
      setTraceError(getErrorMessage(err) || t('logs.trace_usage_load_error'));
    } finally {
      setTraceLoading(false);
    }
  }, [t, traceLoading, traceScopeKey]);

  const loadTraceUsageDetails = useCallback(async () => {
    await loadTraceUsageDetailsInternal(false);
  }, [loadTraceUsageDetailsInternal]);

  const refreshTraceUsageDetails = useCallback(async () => {
    await loadTraceUsageDetailsInternal(true);
  }, [loadTraceUsageDetailsInternal]);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      traceScopeKeyRef.current = traceScopeKey;
      traceAuthLoadedAtRef.current = 0;
      setTraceAuthFileMap(new Map());
      setTraceLoading(false);
      setTraceError('');
    }
  }, [connectionStatus, traceScopeKey]);

  const traceCandidates = useMemo(() => {
    if (!traceLogLine) return [];

    const logPath = normalizeTracePath(traceLogLine.path);
    if (!logPath) return [];

    const logTimestampMs = traceLogLine.timestamp
      ? Date.parse(traceLogLine.timestamp)
      : Number.NaN;

    // Step 1: filter by path match
    const pathMatched = traceUsageDetails.filter((detail) =>
      isPathMatch(logPath, normalizeTracePath(detail.path))
    );
    if (pathMatched.length === 0) return [];

    // Step 2: try to extract model from log message, then filter by model
    const logModel = extractModelFromMessage(traceLogLine.message);
    const modelMatched = logModel
      ? pathMatched.filter(
          (d) => d.model?.toLowerCase() === logModel.toLowerCase()
        )
      : [];

    // Step 3: prefer model-matched set; fall back to path-matched
    const useModelSet = modelMatched.length > 0;
    const source = useModelSet ? modelMatched : pathMatched;

    return source
      .map((detail) => {
        const timeDeltaMs =
          !Number.isNaN(logTimestampMs) && detail.__timestampMs > 0
            ? Math.abs(logTimestampMs - detail.__timestampMs)
            : null;
        return { detail, modelMatched: useModelSet, timeDeltaMs } satisfies TraceCandidate;
      })
      .sort((a, b) => (b.detail.__timestampMs || 0) - (a.detail.__timestampMs || 0))
      .slice(0, TRACE_MAX_CANDIDATES);
  }, [traceLogLine, traceUsageDetails]);

  const resolveTraceSourceInfo = useCallback(
    (sourceRaw: string, authIndex: unknown): SourceInfo =>
      resolveSourceDisplay(sourceRaw, authIndex, traceSourceInfoMap, traceAuthFileMap),
    [traceAuthFileMap, traceSourceInfoMap]
  );

  const openTraceModal = useCallback(
    (line: ParsedLogLine) => {
      if (!isTraceableRequestPath(line.path)) return;
      setTraceError('');
      setTraceLogLine(line);
      void loadTraceUsageDetails();
    },
    [loadTraceUsageDetails]
  );

  const closeTraceModal = useCallback(() => {
    if (requestLogDownloading) return;
    setTraceLogLine(null);
  }, [requestLogDownloading]);

  return {
    traceLogLine,
    traceLoading,
    traceError,
    traceCandidates,
    resolveTraceSourceInfo,
    loadTraceUsageDetails,
    refreshTraceUsageDetails,
    openTraceModal,
    closeTraceModal
  };
}
