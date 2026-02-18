import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { monitorApi, type MonitorServiceHealthData } from '@/services/api/monitor';
import styles from '@/pages/MonitorPage.module.scss';

const ROWS = 7;
const COLS = 96;
const BLOCK_COUNT = ROWS * COLS;
const BLOCK_DURATION_MS = 15 * 60 * 1000;

const COLOR_STOPS = [
  { r: 239, g: 68, b: 68 },   // #ef4444
  { r: 250, g: 204, b: 21 },  // #facc15
  { r: 34, g: 197, b: 94 },   // #22c55e
] as const;

function rateToColor(rate: number): string {
  const t = Math.max(0, Math.min(1, rate));
  const segment = t < 0.5 ? 0 : 1;
  const localT = segment === 0 ? t * 2 : (t - 0.5) * 2;
  const from = COLOR_STOPS[segment];
  const to = COLOR_STOPS[segment + 1];
  const r = Math.round(from.r + (to.r - from.r) * localT);
  const g = Math.round(from.g + (to.g - from.g) * localT);
  const b = Math.round(from.b + (to.b - from.b) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

interface BlockDetail {
  success: number;
  failure: number;
  rate: number;
  startTime: number;
  endTime: number;
}

function buildBlockDetails(data: MonitorServiceHealthData): BlockDetail[] {
  const now = Date.now();
  const windowStart = now - BLOCK_COUNT * BLOCK_DURATION_MS;

  return data.blocks.map((block, idx) => {
    const total = block.success + block.failure;
    const blockStartTime = windowStart + idx * BLOCK_DURATION_MS;
    return {
      success: block.success,
      failure: block.failure,
      rate: total > 0 ? block.success / total : -1,
      startTime: blockStartTime,
      endTime: blockStartTime + BLOCK_DURATION_MS,
    };
  });
}

export function ServiceHealthCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<MonitorServiceHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    monitorApi
      .getServiceHealth()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (activeTooltip === null) return;
    const handler = (e: PointerEvent) => {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [activeTooltip]);

  const handlePointerEnter = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'mouse') setActiveTooltip(idx);
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setActiveTooltip(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      setActiveTooltip((prev) => (prev === idx ? null : idx));
    }
  }, []);

  const getTooltipPositionClass = (idx: number): string => {
    const col = Math.floor(idx / ROWS);
    if (col <= 2) return styles.healthTooltipLeft;
    if (col >= COLS - 3) return styles.healthTooltipRight;
    return '';
  };

  const getTooltipVerticalClass = (idx: number): string => {
    const row = idx % ROWS;
    if (row <= 1) return styles.healthTooltipBelow;
    return '';
  };

  const renderTooltip = (detail: BlockDetail, idx: number) => {
    const total = detail.success + detail.failure;
    const posClass = getTooltipPositionClass(idx);
    const vertClass = getTooltipVerticalClass(idx);
    const timeRange = `${formatDateTime(detail.startTime)} – ${formatDateTime(detail.endTime)}`;

    return (
      <div className={`${styles.healthTooltip} ${posClass} ${vertClass}`}>
        <span className={styles.healthTooltipTime}>{timeRange}</span>
        {total > 0 ? (
          <span className={styles.healthTooltipStats}>
            <span className={styles.healthTooltipSuccess}>{t('status_bar.success_short')} {detail.success}</span>
            <span className={styles.healthTooltipFailure}>{t('status_bar.failure_short')} {detail.failure}</span>
            <span className={styles.healthTooltipRate}>({(detail.rate * 100).toFixed(1)}%)</span>
          </span>
        ) : (
          <span className={styles.healthTooltipStats}>{t('status_bar.no_requests')}</span>
        )}
      </div>
    );
  };

  const blockDetails = data ? buildBlockDetails(data) : [];
  const hasData = data ? data.total_success + data.total_failure > 0 : false;
  const successRate = data?.success_rate ?? 0;

  const rateClass = !hasData
    ? ''
    : successRate >= 90
      ? styles.healthRateHigh
      : successRate >= 50
        ? styles.healthRateMedium
        : styles.healthRateLow;

  if (error) {
    return (
      <div className={styles.healthCard}>
        <div className={styles.healthHeader}>
          <h3 className={styles.healthTitle}>{t('service_health.title')}</h3>
        </div>
        <div className={styles.healthEmpty}>{t('common.load_failed', { defaultValue: t('common.unknown_error') })}</div>
      </div>
    );
  }

  return (
    <div className={styles.healthCard}>
      <div className={styles.healthHeader}>
        <h3 className={styles.healthTitle}>{t('service_health.title')}</h3>
        <div className={styles.healthMeta}>
          <span className={styles.healthWindow}>{t('service_health.window')}</span>
          <span className={`${styles.healthRate} ${rateClass}`}>
            {loading ? '--' : hasData ? `${successRate.toFixed(1)}%` : '--'}
          </span>
        </div>
      </div>
      {loading ? (
        <div className={styles.healthEmpty}>{t('common.loading')}</div>
      ) : (
        <>
          <div className={styles.healthGridScroller}>
            <div className={styles.healthGrid} ref={gridRef}>
              {blockDetails.map((detail, idx) => {
                const isIdle = detail.rate === -1;
                const blockStyle = isIdle ? undefined : { backgroundColor: rateToColor(detail.rate) };
                const isActive = activeTooltip === idx;

                return (
                  <div
                    key={idx}
                    className={`${styles.healthBlockWrapper} ${isActive ? styles.healthBlockActive : ''}`}
                    onPointerEnter={(e) => handlePointerEnter(e, idx)}
                    onPointerLeave={handlePointerLeave}
                    onPointerDown={(e) => handlePointerDown(e, idx)}
                  >
                    <div
                      className={`${styles.healthBlock} ${isIdle ? styles.healthBlockIdle : ''}`}
                      style={blockStyle}
                    />
                    {isActive && renderTooltip(detail, idx)}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.healthLegend}>
            <span className={styles.healthLegendLabel}>{t('service_health.oldest')}</span>
            <div className={styles.healthLegendColors}>
              <div className={`${styles.healthLegendBlock} ${styles.healthBlockIdle}`} />
              <div className={styles.healthLegendBlock} style={{ backgroundColor: '#ef4444' }} />
              <div className={styles.healthLegendBlock} style={{ backgroundColor: '#facc15' }} />
              <div className={styles.healthLegendBlock} style={{ backgroundColor: '#22c55e' }} />
            </div>
            <span className={styles.healthLegendLabel}>{t('service_health.newest')}</span>
          </div>
        </>
      )}
    </div>
  );
}
