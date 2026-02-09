import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart } from 'react-chartjs-2';
import type { TimeRange } from '@/pages/MonitorPage';
import { monitorApi, type MonitorDailyTrendItem } from '@/services/api/monitor';
import { buildMonitorTimeRangeParams } from '@/utils/monitor';
import styles from '@/pages/MonitorPage.module.scss';

interface DailyTrendChartProps {
  timeRange: TimeRange;
  apiFilter: string;
  isDark: boolean;
}

export function DailyTrendChart({ timeRange, apiFilter, isDark }: DailyTrendChartProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [dailyItems, setDailyItems] = useState<MonitorDailyTrendItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = {
      ...buildMonitorTimeRangeParams(timeRange),
      ...(apiFilter ? { api_filter: apiFilter } : {}),
    };

    monitorApi.getDailyTrend(params).then((data) => {
      if (!cancelled) {
        setDailyItems(data.items || []);
        setLoading(false);
      }
    }).catch((err) => {
      console.error('Daily trend load failed:', err);
      if (!cancelled) {
        setDailyItems([]);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [timeRange, apiFilter]);

  // 图表数据
  const chartData = useMemo(() => {
    const labels = dailyItems.map((item) => {
      const date = new Date(item.date);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    return {
      labels,
      datasets: [
        {
          type: 'line' as const,
          label: t('monitor.trend.requests'),
          data: dailyItems.map((item) => item.requests),
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f6',
          borderWidth: 3,
          fill: false,
          tension: 0.35,
          yAxisID: 'y1',
          order: 0,
          pointRadius: 3,
          pointBackgroundColor: '#3b82f6',
        },
        {
          type: 'bar' as const,
          label: t('monitor.trend.input_tokens'),
          data: dailyItems.map((item) => item.input_tokens / 1000),
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          borderColor: 'rgba(34, 197, 94, 0.7)',
          borderWidth: 1,
          borderRadius: 0,
          yAxisID: 'y',
          order: 1,
          stack: 'tokens',
        },
        {
          type: 'bar' as const,
          label: t('monitor.trend.output_tokens'),
          data: dailyItems.map((item) => item.output_tokens / 1000),
          backgroundColor: 'rgba(249, 115, 22, 0.7)',
          borderColor: 'rgba(249, 115, 22, 0.7)',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
          order: 1,
          stack: 'tokens',
        },
      ],
    };
  }, [dailyItems, t]);

  // 图表配置
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: isDark ? '#9ca3af' : '#6b7280',
          usePointStyle: true,
          padding: 16,
          font: {
            size: 11,
          },
          generateLabels: (chart: any) => {
            return chart.data.datasets.map((dataset: any, i: number) => {
              const isLine = dataset.type === 'line';
              return {
                text: dataset.label,
                fillStyle: dataset.backgroundColor,
                strokeStyle: dataset.borderColor,
                lineWidth: 0,
                hidden: !chart.isDatasetVisible(i),
                datasetIndex: i,
                pointStyle: isLine ? 'circle' : 'rect',
              };
            });
          },
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#374151' : '#ffffff',
        titleColor: isDark ? '#f3f4f6' : '#111827',
        bodyColor: isDark ? '#d1d5db' : '#4b5563',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.raw;
            if (context.dataset.yAxisID === 'y1') {
              return `${label}: ${value.toLocaleString()}`;
            }
            return `${label}: ${value.toFixed(1)}K`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        stacked: true,
        grid: {
          color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
          callback: (value: string | number) => `${value}K`,
        },
        title: {
          display: true,
          text: 'Tokens (K)',
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
        title: {
          display: true,
          text: t('monitor.trend.requests'),
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
    },
  }), [isDark, t]);

  const timeRangeLabel = (() => {
    if (timeRange === 'yesterday') return t('monitor.yesterday');
    if (timeRange === 'dayBeforeYesterday') return t('monitor.day_before_yesterday');
    if (timeRange === 1) return t('monitor.today');
    return t('monitor.last_n_days', { n: timeRange });
  })();

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{t('monitor.trend.title')}</h3>
          <p className={styles.chartSubtitle}>
            {timeRangeLabel} · {t('monitor.trend.subtitle')}
          </p>
        </div>
      </div>

      <div className={styles.chartContent}>
        {loading || dailyItems.length === 0 ? (
          <div className={styles.chartEmpty}>
            {loading ? t('common.loading') : t('monitor.no_data')}
          </div>
        ) : (
          <Chart type="bar" data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
}
