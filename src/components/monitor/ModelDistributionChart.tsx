import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Doughnut } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import type { TimeRange } from '@/pages/MonitorPage';
import { monitorApi, type MonitorModelDistributionItem } from '@/services/api/monitor';
import {
  buildMonitorChannelDistributionItems,
  buildMonitorTimeRangeParams,
  type MonitorDistributionListItem,
} from '@/utils/monitor';
import styles from '@/pages/MonitorPage.module.scss';

interface ModelDistributionChartProps {
  timeRange: TimeRange;
  apiFilter: string;
  isDark: boolean;
  providerMap: Record<string, string>;
}

// 颜色调色板
const COLORS = [
  '#3b82f6', // 蓝色
  '#22c55e', // 绿色
  '#f97316', // 橙色
  '#8b5cf6', // 紫色
  '#ec4899', // 粉色
  '#06b6d4', // 青色
  '#eab308', // 黄色
  '#ef4444', // 红色
  '#14b8a6', // 青绿
  '#6366f1', // 靛蓝
];

type ViewMode = 'request' | 'token';
type DistributionMode = 'model' | 'channel';

const EMPTY_DISTRIBUTION_ITEMS: MonitorDistributionListItem[] = [];

export function ModelDistributionChart({ timeRange, apiFilter, isDark, providerMap }: ModelDistributionChartProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('request');
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('model');
  const requestKey = `${timeRange}\0${apiFilter}\0${viewMode}\0${distributionMode}`;
  const otherLabel = t('monitor.distribution.other');
  const [distributionState, setDistributionState] = useState<{
    requestKey: string;
    items: MonitorDistributionListItem[];
  } | null>(null);
  const loading = distributionState?.requestKey !== requestKey;
  const distributionItems = distributionState?.items ?? EMPTY_DISTRIBUTION_ITEMS;

  useEffect(() => {
    let cancelled = false;
    const timeParams = buildMonitorTimeRangeParams(timeRange);

    const loadDistribution = async () => {
      if (distributionMode === 'channel') {
        const data = await monitorApi.getChannelStats({
          limit: 100,
          ...timeParams,
          ...(apiFilter ? { api_filter: apiFilter } : {}),
        });
        return buildMonitorChannelDistributionItems(data.items || [], providerMap, viewMode, 10, otherLabel);
      }

      const data = await monitorApi.getModelDistribution({
        sort: viewMode === 'request' ? 'requests' as const : 'tokens' as const,
        limit: 10,
        ...timeParams,
        ...(apiFilter ? { api_filter: apiFilter } : {}),
      });

      return (data.items || []).map((item: MonitorModelDistributionItem) => ({
        label: item.model,
        requests: item.requests,
        tokens: item.tokens,
      }));
    };

    loadDistribution()
      .then((items) => {
        if (!cancelled) {
          setDistributionState({ requestKey, items });
        }
      })
      .catch((err) => {
        console.error('Distribution load failed:', err);
        if (!cancelled) {
          setDistributionState({ requestKey, items: [] });
        }
      });

    return () => { cancelled = true; };
  }, [timeRange, apiFilter, viewMode, distributionMode, providerMap, otherLabel, requestKey]);

  const timeRangeLabel = (() => {
    if (timeRange === 'yesterday') return t('monitor.yesterday');
    if (timeRange === 'dayBeforeYesterday') return t('monitor.day_before_yesterday');
    if (timeRange === 1) return t('monitor.today');
    return t('monitor.last_n_days', { n: timeRange });
  })();

  // 计算总数
  const total = useMemo(() => {
    return distributionItems.reduce((sum, item) => {
      return sum + (viewMode === 'request' ? item.requests : item.tokens);
    }, 0);
  }, [distributionItems, viewMode]);

  // 图表数据
  const chartData = useMemo(() => {
    return {
      labels: distributionItems.map((item) => item.label),
      datasets: [
        {
          data: distributionItems.map((item) =>
            viewMode === 'request' ? item.requests : item.tokens
          ),
          backgroundColor: COLORS.slice(0, distributionItems.length),
          borderColor: isDark ? '#1f2937' : '#ffffff',
          borderWidth: 2,
        },
      ],
    };
  }, [distributionItems, viewMode, isDark]);

  // 图表配置
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: isDark ? '#374151' : '#ffffff',
        titleColor: isDark ? '#f3f4f6' : '#111827',
        bodyColor: isDark ? '#d1d5db' : '#4b5563',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: TooltipItem<'doughnut'>) => {
            const value = Number(context.raw || 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            if (viewMode === 'request') {
              return `${value.toLocaleString()} ${t('monitor.requests')} (${percentage}%)`;
            }
            return `${value.toLocaleString()} tokens (${percentage}%)`;
          },
        },
      },
    },
  }), [isDark, total, viewMode, t]);

  // 格式化数值
  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  };

  const titleKey = distributionMode === 'channel'
    ? 'monitor.distribution.channel_title'
    : 'monitor.distribution.title';
  const dimensionLabel = distributionMode === 'channel'
    ? t('monitor.distribution.channels')
    : t('monitor.distribution.models');
  const shareLabel = (() => {
    if (distributionMode === 'channel') {
      return viewMode === 'request'
        ? t('monitor.distribution.channel_request_share')
        : t('monitor.distribution.channel_token_share');
    }
    return viewMode === 'request'
      ? t('monitor.distribution.request_share')
      : t('monitor.distribution.token_share');
  })();

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{t(titleKey)}</h3>
          <p className={styles.chartSubtitle}>
            {timeRangeLabel} · {dimensionLabel} · {viewMode === 'request' ? t('monitor.distribution.by_requests') : t('monitor.distribution.by_tokens')}
            {' · Top 10'}
          </p>
        </div>
        <div className={styles.chartControlGroups}>
          <div className={styles.chartControls}>
            <button
              className={`${styles.chartControlBtn} ${distributionMode === 'model' ? styles.active : ''}`}
              onClick={() => setDistributionMode('model')}
            >
              {t('monitor.distribution.models')}
            </button>
            <button
              className={`${styles.chartControlBtn} ${distributionMode === 'channel' ? styles.active : ''}`}
              onClick={() => setDistributionMode('channel')}
            >
              {t('monitor.distribution.channels')}
            </button>
          </div>
          <div className={styles.chartControls}>
            <button
              className={`${styles.chartControlBtn} ${viewMode === 'request' ? styles.active : ''}`}
              onClick={() => setViewMode('request')}
            >
              {t('monitor.distribution.requests')}
            </button>
            <button
              className={`${styles.chartControlBtn} ${viewMode === 'token' ? styles.active : ''}`}
              onClick={() => setViewMode('token')}
            >
              {t('monitor.distribution.tokens')}
            </button>
          </div>
        </div>
      </div>

      {loading || distributionItems.length === 0 ? (
        <div className={styles.chartContent}>
          <div className={styles.chartEmpty}>
            {loading ? t('common.loading') : t('monitor.no_data')}
          </div>
        </div>
      ) : (
        <div className={styles.distributionContent}>
          <div className={styles.donutWrapper}>
            <Doughnut data={chartData} options={chartOptions} />
            <div className={styles.donutCenter}>
              <div className={styles.donutLabel}>
                {shareLabel}
              </div>
            </div>
          </div>
          <div className={styles.legendList}>
            {distributionItems.map((item, index) => {
              const value = viewMode === 'request' ? item.requests : item.tokens;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return (
                <div key={`${item.label}-${index}`} className={styles.legendItem}>
                  <span
                    className={styles.legendDot}
                    style={{ backgroundColor: COLORS[index] }}
                  />
                  <span className={styles.legendName} title={item.label}>
                    {item.label}
                  </span>
                  <span className={styles.legendValue}>
                    {formatValue(value)} ({percentage}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
