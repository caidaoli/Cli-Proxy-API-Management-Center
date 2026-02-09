import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimeRange } from '@/pages/MonitorPage';
import { monitorApi, type MonitorKpiData } from '@/services/api/monitor';
import { buildMonitorTimeRangeParams } from '@/utils/monitor';
import styles from '@/pages/MonitorPage.module.scss';

interface KpiCardsProps {
  timeRange: TimeRange;
  apiFilter: string;
  isDark?: boolean;
}

// 格式化数字
function formatNumber(num: number): string {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(2) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toLocaleString();
}

export function KpiCards({ timeRange, apiFilter }: KpiCardsProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [kpiData, setKpiData] = useState<MonitorKpiData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = {
      ...buildMonitorTimeRangeParams(timeRange),
      ...(apiFilter ? { api_filter: apiFilter } : {}),
    };

    monitorApi.getKpi(params).then((data) => {
      if (!cancelled) {
        setKpiData(data);
        setLoading(false);
      }
    }).catch((err) => {
      console.error('KPI data load failed:', err);
      if (!cancelled) {
        setKpiData(null);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [timeRange, apiFilter]);

  const timeRangeLabel = (() => {
    if (timeRange === 'yesterday') return t('monitor.yesterday');
    if (timeRange === 'dayBeforeYesterday') return t('monitor.day_before_yesterday');
    if (timeRange === 1) return t('monitor.today');
    return t('monitor.last_n_days', { n: timeRange });
  })();

  const stats = kpiData ?? {
    total_requests: 0,
    success_requests: 0,
    failed_requests: 0,
    success_rate: 0,
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    cached_tokens: 0,
    avg_tpm: 0,
    avg_rpm: 0,
    avg_rpd: 0,
  };

  return (
    <div className={styles.kpiGrid}>
      {/* 请求数 */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.requests')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : formatNumber(stats.total_requests)}
        </div>
        <div className={styles.kpiMeta}>
          <span className={styles.kpiSuccess}>
            {t('monitor.kpi.success')}: {loading ? '--' : stats.success_requests.toLocaleString()}
          </span>
          <span className={styles.kpiFailure}>
            {t('monitor.kpi.failed')}: {loading ? '--' : stats.failed_requests.toLocaleString()}
          </span>
          <span>
            {t('monitor.kpi.rate')}: {loading ? '--' : stats.success_rate.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Tokens */}
      <div className={`${styles.kpiCard} ${styles.green}`}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.tokens')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : formatNumber(stats.total_tokens)}
        </div>
        <div className={styles.kpiMeta}>
          <span>{t('monitor.kpi.input')}: {loading ? '--' : formatNumber(stats.input_tokens)}</span>
          <span>{t('monitor.kpi.output')}: {loading ? '--' : formatNumber(stats.output_tokens)}</span>
        </div>
      </div>

      {/* 平均 TPM */}
      <div className={`${styles.kpiCard} ${styles.purple}`}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.avg_tpm')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : formatNumber(stats.avg_tpm)}
        </div>
        <div className={styles.kpiMeta}>
          <span>{t('monitor.kpi.tokens_per_minute')}</span>
        </div>
      </div>

      {/* 平均 RPM */}
      <div className={`${styles.kpiCard} ${styles.orange}`}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.avg_rpm')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : stats.avg_rpm.toFixed(1)}
        </div>
        <div className={styles.kpiMeta}>
          <span>{t('monitor.kpi.requests_per_minute')}</span>
        </div>
      </div>

      {/* 日均 RPD */}
      <div className={`${styles.kpiCard} ${styles.cyan}`}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.avg_rpd')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : formatNumber(stats.avg_rpd)}
        </div>
        <div className={styles.kpiMeta}>
          <span>{t('monitor.kpi.requests_per_day')}</span>
        </div>
      </div>
    </div>
  );
}
