import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { monitorApi, type MonitorRequestLogItem } from '@/services/api';
import { TimeRangeSelector, formatTimeRangeCaption, type TimeRange } from './TimeRangeSelector';
import {
  REQUEST_LOG_FILTER_KEYS,
  REQUEST_LOG_TABLE_COLUMN_KEYS,
  REQUEST_LOG_TABLE_COLUMN_WIDTHS,
  REQUEST_LOG_TABLE_HEADER_KEYS,
  REQUEST_LOG_TABLE_MIN_WIDTH,
  type RequestLogFilterKey,
  type RequestLogTableColumnKey,
} from './requestLogColumns';
import {
  formatProviderDisplay,
  formatTimestamp,
  getProviderDisplayParts,
  buildMonitorTimeRangeParams,
  formatCacheTokenRatio,
  computeUncachedInputTokens,
  formatOutputTokensPerSecond,
  calculateMonitorRequestCost,
  formatMonitorCost,
  type DateRange,
} from '@/utils/monitor';
import styles from '@/pages/MonitorPage.module.scss';

interface RequestLogsProps {
  refreshKey: number;
  loading: boolean;
  providerMap: Record<string, string>;
  apiFilter: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  timestampMs: number;
  model: string;
  source: string;
  providerName: string | null;
  maskedKey: string;
  failed: boolean;
  inputTokens: number;
  totalInputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  latencyMs: number;
  ttftMs: number;
  recentRequests: { failed: boolean; timestamp: number }[];
}

const REQUEST_LOG_NUMERIC_COLUMN_KEYS = new Set<RequestLogTableColumnKey>([
  'toks',
  'input',
  'output',
  'cache',
  'cacheRate',
  'cost',
]);

export function RequestLogs({
  refreshKey,
  loading,
  providerMap,
  apiFilter,
}: RequestLogsProps) {
  const { t } = useTranslation();
  const [filterModel, setFilterModel] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'success' | 'failed'>('');
  const [autoRefresh, setAutoRefresh] = useState(10);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchLogDataRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const [timeRange, setTimeRange] = useState<TimeRange>(1);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filterOptions, setFilterOptions] = useState<{
    models: string[];
    sources: string[];
  }>({
    models: [],
    sources: [],
  });

  const handleTimeRangeChange = useCallback((range: TimeRange, custom?: DateRange) => {
    setTimeRange(range);
    setCustomRange(custom);
    setPage(1);
  }, []);

  const toLogEntry = useCallback(
    (item: MonitorRequestLogItem, index: number): LogEntry => {
      const source = item.source || 'unknown';
      const { provider, masked } = getProviderDisplayParts(source, providerMap);
      const timestampMs = item.timestamp ? new Date(item.timestamp).getTime() : 0;
      const totalInputTokens = item.input_tokens || 0;
      const cachedTokens = item.cached_tokens || 0;
      const outputTokens = item.output_tokens || 0;
      return {
        id: `${item.timestamp}-${item.api_key}-${item.model}-${index}`,
        timestamp: item.timestamp,
        timestampMs,
        model: item.model,
        source,
        providerName: provider,
        maskedKey: masked,
        failed: item.failed,
        inputTokens: computeUncachedInputTokens(totalInputTokens, cachedTokens),
        totalInputTokens,
        outputTokens,
        cachedTokens,
        cost: calculateMonitorRequestCost(item.model, totalInputTokens, outputTokens, cachedTokens),
        latencyMs: item.latency_ms || 0,
        ttftMs: item.ttft_ms || 0,
        recentRequests: (item.recent_requests || []).map((req) => ({
          failed: !!req.failed,
          timestamp: req.timestamp ? new Date(req.timestamp).getTime() : 0,
        })),
      };
    },
    [providerMap]
  );

  // 独立获取日志数据
  const fetchLogData = useCallback(async () => {
    setLogLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
        api_filter: apiFilter || undefined,
        model: filterModel || undefined,
        source: filterSource || undefined,
        status: filterStatus || undefined,
        ...buildMonitorTimeRangeParams(timeRange, customRange),
      };

      const response = await monitorApi.getRequestLogs(params);
      const items = (response.items || []).map(toLogEntry);
      setLogEntries(items);
      setTotal(response.total || 0);
      setTotalPages(response.total_pages || 0);
      setFilterOptions((prev) => ({
        models: filterModel ? prev.models : (response.filters?.models || []),
        sources: filterSource ? prev.sources : (response.filters?.sources || []),
      }));

      const safePage = response.page || page;
      if (safePage !== page) {
        setPage(safePage);
      }
    } catch (err) {
      console.error('日志刷新失败：', err);
      setLogEntries([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLogLoading(false);
    }
  }, [
    page,
    pageSize,
    apiFilter,
    filterModel,
    filterSource,
    filterStatus,
    timeRange,
    customRange,
    toLogEntry,
  ]);

  useEffect(() => {
    fetchLogDataRef.current = fetchLogData;
  }, [fetchLogData]);

  useEffect(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (autoRefresh <= 0) {
      setCountdown(0);
      return;
    }

    setCountdown(autoRefresh);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchLogDataRef.current();
          return autoRefresh;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [autoRefresh]);

  useEffect(() => {
    fetchLogData();
  }, [fetchLogData, refreshKey]);

  const showLoading = (logLoading || loading) && logEntries.length === 0;

  const getCountdownText = () => {
    if (logLoading) {
      return t('monitor.logs.refreshing');
    }
    if (autoRefresh === 0) {
      return t('monitor.logs.manual_refresh');
    }
    if (countdown > 0) {
      return t('monitor.logs.refresh_in_seconds', { seconds: countdown });
    }
    return t('monitor.logs.refreshing');
  };

  const formatNumber = (num: number) => num.toLocaleString('zh-CN');

  const goToPage = (nextPage: number) => {
    if (nextPage < 1) return;
    if (totalPages > 0 && nextPage > totalPages) return;
    setPage(nextPage);
  };

  const renderCell = (entry: LogEntry, column: RequestLogTableColumnKey) => {
    switch (column) {
      case 'model':
        return <td title={entry.model}>{entry.model}</td>;
      case 'source':
        return (
          <td title={entry.source}>
            {entry.providerName ? (
              <>
                <span className={styles.channelName}>{entry.providerName}</span>
                <span className={styles.channelSecret}> ({entry.maskedKey})</span>
              </>
            ) : (
              entry.maskedKey
            )}
          </td>
        );
      case 'status':
        return (
          <td>
            <span className={`${styles.statusPill} ${entry.failed ? styles.failed : styles.success}`}>
              {entry.failed ? t('monitor.logs.failed') : t('monitor.logs.success')}
            </span>
          </td>
        );
      case 'recent':
        return (
          <td>
            <div className={styles.statusBars}>
              {entry.recentRequests.map((req, idx) => (
                <div
                  key={idx}
                  className={`${styles.statusBar} ${req.failed ? styles.failure : styles.success}`}
                />
              ))}
            </div>
          </td>
        );
      case 'timing': {
        const ttft = entry.ttftMs > 0 ? (entry.ttftMs / 1000).toFixed(2) : '-';
        const latency = entry.latencyMs > 0 ? (entry.latencyMs / 1000).toFixed(2) : '-';
        const titleParts: string[] = [];
        if (entry.ttftMs > 0) titleParts.push(`TTFT: ${formatNumber(entry.ttftMs)}ms`);
        if (entry.latencyMs > 0) titleParts.push(`Latency: ${formatNumber(entry.latencyMs)}ms`);
        return (
          <td className={styles.tokenCell} title={titleParts.join(' / ') || '-'}>
            {ttft === '-' && latency === '-' ? '-' : (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>{ttft}</span>
                {' / '}
                {latency}
              </>
            )}
          </td>
        );
      }
      case 'toks': {
        const toks = formatOutputTokensPerSecond(entry.outputTokens, entry.latencyMs, entry.ttftMs);
        return <td className={`${styles.tokenCell} ${styles.numberCell}`}>{toks}</td>;
      }
      case 'input':
        return (
          <td className={`${styles.tokenCell} ${styles.numberCell}`} title={formatNumber(entry.inputTokens)}>
            {formatNumber(entry.inputTokens)}
          </td>
        );
      case 'output':
        return (
          <td className={`${styles.tokenCell} ${styles.numberCell}`} title={formatNumber(entry.outputTokens)}>
            {formatNumber(entry.outputTokens)}
          </td>
        );
      case 'cache':
        return (
          <td
            className={`${styles.tokenCell} ${styles.numberCell}`}
            title={entry.cachedTokens > 0 ? formatNumber(entry.cachedTokens) : ''}
          >
            {entry.cachedTokens > 0 ? formatNumber(entry.cachedTokens) : ''}
          </td>
        );
      case 'cacheRate': {
        const cache = formatCacheTokenRatio(entry.cachedTokens, entry.totalInputTokens);
        return (
          <td className={`${styles.tokenCell} ${styles.numberCell}`} title={entry.cachedTokens > 0 ? cache.title : ''}>
            {entry.cachedTokens > 0 ? cache.ratio : ''}
          </td>
        );
      }
      case 'cost':
        return (
          <td className={`${styles.tokenCell} ${styles.numberCell}`} title={formatMonitorCost(entry.cost)}>
            {formatMonitorCost(entry.cost)}
          </td>
        );
      case 'time':
        return <td>{formatTimestamp(entry.timestamp)}</td>;
    }
  };

  const renderRow = (entry: LogEntry) => {
    return (
      <>
        {REQUEST_LOG_TABLE_COLUMN_KEYS.map((column) => (
          <Fragment key={column}>{renderCell(entry, column)}</Fragment>
        ))}
      </>
    );
  };

  const renderFilterSelect = (filterKey: RequestLogFilterKey) => {
    switch (filterKey) {
      case 'model':
        return (
          <select
            key={filterKey}
            className={styles.logSelect}
            value={filterModel}
            onChange={(e) => {
              setFilterModel(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('monitor.logs.all_models')}</option>
            {filterOptions.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        );
      case 'source':
        return (
          <select
            key={filterKey}
            className={styles.logSelect}
            value={filterSource}
            onChange={(e) => {
              setFilterSource(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('monitor.logs.all_sources')}</option>
            {filterOptions.sources.map((source) => (
              <option key={source} value={source}>
                {formatProviderDisplay(source, providerMap)}
              </option>
            ))}
          </select>
        );
      case 'status':
        return (
          <select
            key={filterKey}
            className={styles.logSelect}
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as '' | 'success' | 'failed');
              setPage(1);
            }}
          >
            <option value="">{t('monitor.logs.all_status')}</option>
            <option value="success">{t('monitor.logs.success')}</option>
            <option value="failed">{t('monitor.logs.failed')}</option>
          </select>
        );
    }
  };

  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <>
      <Card
        title={t('monitor.logs.title')}
        subtitle={
          <span>
            {formatTimeRangeCaption(timeRange, customRange, t)} ·{' '}
            {t('monitor.logs.showing', { start: pageStart, end: pageEnd, total })}
            <span style={{ color: 'var(--text-tertiary)' }}>
              {' '}
              · {t('monitor.logs.scroll_hint')}
            </span>
          </span>
        }
        extra={
          <TimeRangeSelector
            value={timeRange}
            onChange={handleTimeRangeChange}
            customRange={customRange}
          />
        }
      >
        <div className={styles.logFilters}>
          {REQUEST_LOG_FILTER_KEYS.map(renderFilterSelect)}

          <span className={styles.logLastUpdate}>{getCountdownText()}</span>

          <select
            className={styles.logSelect}
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
          >
            <option value="0">{t('monitor.logs.manual_refresh')}</option>
            <option value="5">{t('monitor.logs.refresh_5s')}</option>
            <option value="10">{t('monitor.logs.refresh_10s')}</option>
            <option value="15">{t('monitor.logs.refresh_15s')}</option>
            <option value="30">{t('monitor.logs.refresh_30s')}</option>
            <option value="60">{t('monitor.logs.refresh_60s')}</option>
          </select>

          <select
            className={styles.logSelect}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value="20">{t('monitor.logs.page_size_20')}</option>
            <option value="50">{t('monitor.logs.page_size_50')}</option>
            <option value="100">{t('monitor.logs.page_size_100')}</option>
          </select>
        </div>

        <div className={styles.logTableWrapper}>
          {showLoading ? (
            <div className={styles.emptyState}>{t('common.loading')}</div>
          ) : logEntries.length === 0 ? (
            <div className={styles.emptyState}>{t('monitor.no_data')}</div>
          ) : (
            <table
              className={`${styles.table} ${styles.virtualTable}`}
              style={{ minWidth: REQUEST_LOG_TABLE_MIN_WIDTH }}
            >
              <colgroup>
                {REQUEST_LOG_TABLE_COLUMN_KEYS.map((column) => (
                  <col key={column} style={{ width: REQUEST_LOG_TABLE_COLUMN_WIDTHS[column] }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {REQUEST_LOG_TABLE_COLUMN_KEYS.map((column) => (
                    <th
                      key={column}
                      className={REQUEST_LOG_NUMERIC_COLUMN_KEYS.has(column) ? styles.numberCell : undefined}
                    >
                      {t(REQUEST_LOG_TABLE_HEADER_KEYS[column])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logEntries.map((entry) => (
                  <tr key={entry.id}>{renderRow(entry)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 0 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => goToPage(1)} disabled={page <= 1}>
              {t('monitor.logs.first_page')}
            </button>
            <button
              className={styles.pageBtn}
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              {t('monitor.logs.prev_page')}
            </button>
            <span className={styles.pageBtn}>
              {t('monitor.logs.page_info', { current: page, total: totalPages })}
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              {t('monitor.logs.next_page')}
            </button>
            <button
              className={styles.pageBtn}
              onClick={() => goToPage(totalPages)}
              disabled={page >= totalPages}
            >
              {t('monitor.logs.last_page')}
            </button>
          </div>
        )}

        {logEntries.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-tertiary)',
              marginTop: 8,
            }}
          >
            {t('monitor.logs.total_count', { count: total })}
          </div>
        )}
      </Card>
    </>
  );
}
