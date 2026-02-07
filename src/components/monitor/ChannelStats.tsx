import { useMemo, useState, useCallback, Fragment, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { monitorApi, type MonitorChannelStatsItem } from '@/services/api';
import { useDisableModel } from '@/hooks';
import { TimeRangeSelector, type TimeRange } from './TimeRangeSelector';
import { DisableModelModal } from './DisableModelModal';
import {
  formatTimestamp,
  getRateClassName,
  getProviderDisplayParts,
  buildMonitorTimeRangeParams,
  type DateRange,
} from '@/utils/monitor';
import type { UsageData } from '@/pages/MonitorPage';
import styles from '@/pages/MonitorPage.module.scss';

interface ChannelStatsProps {
  data: UsageData | null;
  loading: boolean;
  providerMap: Record<string, string>;
  providerModels: Record<string, Set<string>>;
}

interface ModelStat {
  requests: number;
  success: number;
  failed: number;
  successRate: number;
  recentRequests: { failed: boolean; timestamp: number }[];
  lastTimestamp: number;
}

interface ChannelStat {
  source: string;
  displayName: string;
  providerName: string | null;
  maskedKey: string;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  successRate: number;
  lastRequestTime: number;
  recentRequests: { failed: boolean; timestamp: number }[];
  models: Record<string, ModelStat>;
}

interface ChannelFilterOption {
  source: string;
  label: string;
}

export function ChannelStats({ data, loading, providerMap, providerModels }: ChannelStatsProps) {
  const { t } = useTranslation();
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'success' | 'failed'>('');

  const [timeRange, setTimeRange] = useState<TimeRange>(1);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const [channelStats, setChannelStats] = useState<ChannelStat[]>([]);
  const [filters, setFilters] = useState<{ channels: ChannelFilterOption[]; models: string[] }>({ channels: [], models: [] });
  const [statsLoading, setStatsLoading] = useState(false);

  const {
    disableState,
    disabling,
    isModelDisabled,
    handleDisableClick: onDisableClick,
    handleConfirmDisable,
    handleCancelDisable,
  } = useDisableModel({ providerMap, providerModels });

  const handleTimeRangeChange = useCallback((range: TimeRange, custom?: DateRange) => {
    setTimeRange(range);
    setCustomRange(custom);
  }, []);

  const formatChannelLabel = useCallback((source: string): string => {
    const normalizedSource = source || 'unknown';
    const { provider, masked } = getProviderDisplayParts(normalizedSource, providerMap);
    return provider ? `${provider} (${masked})` : masked;
  }, [providerMap]);

  const mapChannelStat = useCallback((item: MonitorChannelStatsItem): ChannelStat => {
    const source = item.source || 'unknown';
    const { provider, masked } = getProviderDisplayParts(source, providerMap);
    const displayName = provider ? `${provider} (${masked})` : masked;

    const models: Record<string, ModelStat> = {};
    (item.models || []).forEach((model) => {
      models[model.model] = {
        requests: model.requests || 0,
        success: model.success || 0,
        failed: model.failed || 0,
        successRate: model.success_rate || 0,
        recentRequests: (model.recent_requests || []).map((req) => ({
          failed: !!req.failed,
          timestamp: req.timestamp ? new Date(req.timestamp).getTime() : 0,
        })),
        lastTimestamp: model.last_request_at ? new Date(model.last_request_at).getTime() : 0,
      };
    });

    return {
      source,
      displayName,
      providerName: provider,
      maskedKey: masked,
      totalRequests: item.total_requests || 0,
      successRequests: item.success_requests || 0,
      failedRequests: item.failed_requests || 0,
      successRate: item.success_rate || 0,
      lastRequestTime: item.last_request_at ? new Date(item.last_request_at).getTime() : 0,
      recentRequests: (item.recent_requests || []).map((req) => ({
        failed: !!req.failed,
        timestamp: req.timestamp ? new Date(req.timestamp).getTime() : 0,
      })),
      models,
    };
  }, [providerMap]);

  const loadChannelStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await monitorApi.getChannelStats({
        limit: 10,
        source: filterChannel || undefined,
        status: filterStatus || undefined,
        model: filterModel || undefined,
        ...buildMonitorTimeRangeParams(timeRange, customRange),
      });
      const mapped = (response.items || []).map(mapChannelStat);
      setChannelStats(mapped);

      const sourceSet = new Set<string>(
        (response.filters?.sources && response.filters.sources.length > 0)
          ? response.filters.sources
          : mapped.map((stat) => stat.source)
      );
      const channels = Array.from(sourceSet)
        .filter((source) => !!source)
        .map((source) => ({ source, label: formatChannelLabel(source) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));

      const modelSet = new Set<string>(
        (response.filters?.models && response.filters.models.length > 0)
          ? response.filters.models
          : mapped.flatMap((stat) => Object.keys(stat.models))
      );

      setFilters({ channels, models: Array.from(modelSet).sort() });
    } catch (err) {
      console.error('渠道统计加载失败：', err);
      setChannelStats([]);
      setFilters({ channels: [], models: [] });
    } finally {
      setStatsLoading(false);
    }
  }, [filterChannel, filterStatus, filterModel, timeRange, customRange, mapChannelStat, formatChannelLabel]);

  useEffect(() => {
    loadChannelStats();
  }, [loadChannelStats, data]);

  const filteredStats = useMemo(() => {
    return channelStats.filter((stat) => {
      if (filterChannel && stat.source !== filterChannel) return false;
      return true;
    });
  }, [channelStats, filterChannel]);

  useEffect(() => {
    if (expandedChannel && !filteredStats.some((stat) => stat.source === expandedChannel)) {
      setExpandedChannel(null);
    }
  }, [expandedChannel, filteredStats]);

  const toggleExpand = (source: string) => {
    setExpandedChannel(expandedChannel === source ? null : source);
  };

  const handleDisableClick = (source: string, model: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDisableClick(source, model);
  };

  return (
    <>
      <Card
        title={t('monitor.channel.title')}
        subtitle={t('monitor.channel.click_hint')}
        extra={
          <TimeRangeSelector
            value={timeRange}
            onChange={handleTimeRangeChange}
            customRange={customRange}
          />
        }
      >
        <div className={styles.logFilters}>
          <select
            className={styles.logSelect}
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
          >
            <option value="">{t('monitor.channel.all_channels')}</option>
            {filters.channels.map((channel) => (
              <option key={channel.source} value={channel.source}>{channel.label}</option>
            ))}
          </select>
          <select
            className={styles.logSelect}
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
          >
            <option value="">{t('monitor.channel.all_models')}</option>
            {filters.models.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
          <select
            className={styles.logSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as '' | 'success' | 'failed')}
          >
            <option value="">{t('monitor.channel.all_status')}</option>
            <option value="success">{t('monitor.channel.only_success')}</option>
            <option value="failed">{t('monitor.channel.only_failed')}</option>
          </select>
        </div>

        <div className={styles.tableWrapper}>
          {(statsLoading || loading) ? (
            <div className={styles.emptyState}>{t('common.loading')}</div>
          ) : filteredStats.length === 0 ? (
            <div className={styles.emptyState}>{t('monitor.no_data')}</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('monitor.channel.header_name')}</th>
                  <th>{t('monitor.channel.header_count')}</th>
                  <th>{t('monitor.channel.header_rate')}</th>
                  <th>{t('monitor.channel.header_recent')}</th>
                  <th>{t('monitor.channel.header_time')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((stat) => (
                  <Fragment key={stat.source}>
                    <tr
                      className={styles.expandable}
                      onClick={() => toggleExpand(stat.source)}
                    >
                      <td>
                        {stat.providerName ? (
                          <>
                            <span className={styles.channelName}>{stat.providerName}</span>
                            <span className={styles.channelSecret}> ({stat.maskedKey})</span>
                          </>
                        ) : (
                          stat.maskedKey
                        )}
                      </td>
                      <td>{stat.totalRequests.toLocaleString()}</td>
                      <td className={getRateClassName(stat.successRate, styles)}>
                        {stat.successRate.toFixed(1)}%
                      </td>
                      <td>
                        <div className={styles.statusBars}>
                          {stat.recentRequests.map((req, i) => (
                            <div
                              key={i}
                              className={`${styles.statusBar} ${req.failed ? styles.failure : styles.success}`}
                            />
                          ))}
                        </div>
                      </td>
                      <td>{formatTimestamp(stat.lastRequestTime)}</td>
                    </tr>
                    {expandedChannel === stat.source && (
                      <tr key={`${stat.source}-detail`}>
                        <td colSpan={5} className={styles.expandDetail}>
                          <div className={styles.expandTableWrapper}>
                            <table className={styles.table}>
                              <thead>
                                <tr>
                                  <th>{t('monitor.channel.model')}</th>
                                  <th>{t('monitor.channel.header_count')}</th>
                                  <th>{t('monitor.channel.header_rate')}</th>
                                  <th>{t('monitor.channel.success')}/{t('monitor.channel.failed')}</th>
                                  <th>{t('monitor.channel.header_recent')}</th>
                                  <th>{t('monitor.channel.header_time')}</th>
                                  <th>{t('monitor.logs.header_actions')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(stat.models)
                                  .sort((a, b) => {
                                    const aDisabled = isModelDisabled(stat.source, a[0]);
                                    const bDisabled = isModelDisabled(stat.source, b[0]);
                                    if (aDisabled !== bDisabled) {
                                      return aDisabled ? 1 : -1;
                                    }
                                    return b[1].requests - a[1].requests;
                                  })
                                  .map(([modelName, modelStat]) => {
                                    const disabled = isModelDisabled(stat.source, modelName);
                                    return (
                                      <tr key={modelName} className={disabled ? styles.modelDisabled : ''}>
                                        <td>{modelName}</td>
                                        <td>{modelStat.requests.toLocaleString()}</td>
                                        <td className={getRateClassName(modelStat.successRate, styles)}>
                                          {modelStat.successRate.toFixed(1)}%
                                        </td>
                                        <td>
                                          <span className={styles.kpiSuccess}>{modelStat.success}</span>
                                          {' / '}
                                          <span className={styles.kpiFailure}>{modelStat.failed}</span>
                                        </td>
                                        <td>
                                          <div className={styles.statusBars}>
                                            {modelStat.recentRequests.map((req, i) => (
                                              <div
                                                key={i}
                                                className={`${styles.statusBar} ${req.failed ? styles.failure : styles.success}`}
                                              />
                                            ))}
                                          </div>
                                        </td>
                                        <td>{formatTimestamp(modelStat.lastTimestamp)}</td>
                                        <td>
                                          {disabled ? (
                                            <span className={styles.disabledLabel}>{t('monitor.logs.removed')}</span>
                                          ) : stat.source && stat.source !== '-' && stat.source !== 'unknown' ? (
                                            <button
                                              className={styles.disableBtn}
                                              onClick={(e) => handleDisableClick(stat.source, modelName, e)}
                                            >
                                              {t('monitor.logs.disable')}
                                            </button>
                                          ) : '-'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <DisableModelModal
        disableState={disableState}
        disabling={disabling}
        onConfirm={handleConfirmDisable}
        onCancel={handleCancelDisable}
      />
    </>
  );
}
