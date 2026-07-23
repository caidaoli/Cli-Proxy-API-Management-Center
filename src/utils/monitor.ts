/**
 * 监控中心公共工具函数
 */

import type {
  MonitorChannelStatsItem,
  MonitorFailureStatsItem,
  MonitorHourlyModelsData,
  MonitorHourlyTokensData,
  MonitorKpiData,
  MonitorTimeRangeQuery,
} from '@/services/api/monitor';
import { calculateModelCost } from './costCalculator.ts';

/**
 * 日期范围接口
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * 监控接口查询时间范围类型
 */
export type MonitorQueryRange = number | 'yesterday' | 'dayBeforeYesterday' | 'custom';

/**
 * 构造监控接口的时间查询参数
 */
export function buildMonitorTimeRangeParams(
  range: MonitorQueryRange,
  customRange?: DateRange
): MonitorTimeRangeQuery {
  if (customRange) {
    return {
      start_time: customRange.start.toISOString(),
      end_time: customRange.end.toISOString(),
    };
  }

  if (range === 'custom') {
    return {};
  }

  if (range === 'dayBeforeYesterday') {
    return { time_range: 'dayBeforeYesterday' };
  }

  if (range === 'yesterday') {
    return { time_range: 'yesterday' };
  }

  return { time_range: String(range) };
}

const monitorKpiNumberFields = [
  'total_requests',
  'success_requests',
  'failed_requests',
  'success_rate',
  'total_tokens',
  'input_tokens',
  'output_tokens',
  'reasoning_tokens',
  'cached_tokens',
  'cache_write_tokens',
  'avg_tpm',
  'avg_rpm',
  'avg_rpd',
] as const satisfies readonly (keyof MonitorKpiData)[];

const toSafeMonitorNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toSafeMonitorNumberArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(toSafeMonitorNumber) : [];

const toSafeMonitorStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const toSafeMonitorNumberArrayRecord = (value: unknown): Record<string, number[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, values]) => [
      key,
      toSafeMonitorNumberArray(values),
    ])
  );
};

export interface MonitorFilterOptionsState<TChannel = string, TModel = string> {
  channels: TChannel[];
  models: TModel[];
}

export function mergeMonitorFilterOptions<TChannel, TModel>(
  previous: MonitorFilterOptionsState<TChannel, TModel>,
  incoming: MonitorFilterOptionsState<TChannel, TModel>,
  activeFilters: Record<string, unknown>
): MonitorFilterOptionsState<TChannel, TModel> {
  const hasActiveFilter = Object.values(activeFilters).some(
    (value) => String(value ?? '').trim() !== ''
  );

  return hasActiveFilter ? previous : incoming;
}

export interface MonitorDistributionListItem {
  label: string;
  tokens: number;
  cost: number;
}

export type MonitorDistributionMetric = 'token' | 'cost';

function buildTopMonitorDistributionItems(
  items: MonitorDistributionListItem[],
  metric: MonitorDistributionMetric,
  limit: number,
  otherLabel: string
): MonitorDistributionListItem[] {
  const metricKey = metric === 'cost' ? 'cost' : 'tokens';
  const maxItems = Math.max(0, Math.floor(limit));

  if (maxItems === 0) {
    return [];
  }

  const sorted = items
    .filter((item) => item[metricKey] > 0)
    .sort((a, b) => b[metricKey] - a[metricKey]);

  if (sorted.length <= maxItems) {
    return sorted;
  }

  if (maxItems < 2) {
    return sorted.slice(0, maxItems);
  }

  const visibleCount = Math.max(0, maxItems - 1);
  const visible = sorted.slice(0, visibleCount);
  const rest = sorted.slice(visibleCount);
  const other = rest.reduce<MonitorDistributionListItem>(
    (sum, item) => ({
      label: otherLabel,
      tokens: sum.tokens + item.tokens,
      cost: sum.cost + item.cost,
    }),
    { label: otherLabel, tokens: 0, cost: 0 }
  );

  return [...visible, other];
}

function calculateMonitorModelStatsCost(model: {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_write_tokens: number;
}): number {
  return calculateMonitorAggregateCost(
    model.model,
    toSafeMonitorNumber(model.input_tokens),
    toSafeMonitorNumber(model.output_tokens),
    toSafeMonitorNumber(model.cached_tokens),
    toSafeMonitorNumber(model.cache_write_tokens)
  );
}

export function buildMonitorChannelDistributionItems(
  items: MonitorChannelStatsItem[],
  providerMap: Record<string, string>,
  sortBy: MonitorDistributionMetric,
  limit = 10,
  otherLabel = '其他'
): MonitorDistributionListItem[] {
  const distributionItems = items.map((item) => {
    const source = item.source || 'unknown';
    const { provider, masked } = getProviderDisplayParts(source, providerMap);

    return {
      label: provider ? `${provider} (${masked})` : masked,
      tokens: toSafeMonitorNumber(item.input_tokens) + toSafeMonitorNumber(item.output_tokens),
      cost: (item.models || []).reduce(
        (sum, model) => sum + calculateMonitorModelStatsCost(model),
        0
      ),
    };
  });

  return buildTopMonitorDistributionItems(distributionItems, sortBy, limit, otherLabel);
}

export function buildMonitorModelDistributionItems(
  items: MonitorChannelStatsItem[],
  sortBy: MonitorDistributionMetric,
  limit = 10,
  otherLabel = '其他'
): MonitorDistributionListItem[] {
  const models = new Map<string, MonitorDistributionListItem>();

  items.forEach((item) => {
    (item.models || []).forEach((model) => {
      const label = model.model || 'unknown';
      const previous = models.get(label) ?? { label, tokens: 0, cost: 0 };
      previous.tokens +=
        toSafeMonitorNumber(model.input_tokens) + toSafeMonitorNumber(model.output_tokens);
      previous.cost += calculateMonitorModelStatsCost(model);
      models.set(label, previous);
    });
  });

  return buildTopMonitorDistributionItems(Array.from(models.values()), sortBy, limit, otherLabel);
}

export function formatMonitorNumber(value: unknown): string {
  const num = toSafeMonitorNumber(value);

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

export function normalizeMonitorKpiData(raw: unknown): MonitorKpiData | null {
  const source =
    raw && typeof raw === 'object' ? (raw as Partial<Record<keyof MonitorKpiData, unknown>>) : null;
  if (!source || !monitorKpiNumberFields.some((field) => field in source)) {
    return null;
  }

  const normalized = {} as MonitorKpiData;

  for (const field of monitorKpiNumberFields) {
    normalized[field] = toSafeMonitorNumber(source[field]);
  }

  return normalized;
}

export function normalizeMonitorHourlyModelsData(raw: unknown): MonitorHourlyModelsData {
  const source =
    raw && typeof raw === 'object'
      ? (raw as Partial<Record<keyof MonitorHourlyModelsData, unknown>>)
      : {};

  return {
    hours: toSafeMonitorStringArray(source.hours),
    models: toSafeMonitorStringArray(source.models),
    model_data: toSafeMonitorNumberArrayRecord(source.model_data),
    success_rates: toSafeMonitorNumberArray(source.success_rates),
  };
}

export function normalizeMonitorHourlyTokensData(raw: unknown): MonitorHourlyTokensData {
  const source =
    raw && typeof raw === 'object'
      ? (raw as Partial<Record<keyof MonitorHourlyTokensData, unknown>>)
      : {};

  return {
    hours: toSafeMonitorStringArray(source.hours),
    total_tokens: toSafeMonitorNumberArray(source.total_tokens),
    input_tokens: toSafeMonitorNumberArray(source.input_tokens),
    output_tokens: toSafeMonitorNumberArray(source.output_tokens),
    reasoning_tokens: toSafeMonitorNumberArray(source.reasoning_tokens),
    cached_tokens: toSafeMonitorNumberArray(source.cached_tokens),
    cache_write_tokens: toSafeMonitorNumberArray(source.cache_write_tokens),
  };
}

export function applyMonitorChannelStatsModelFilter(
  items: MonitorChannelStatsItem[],
  modelFilter?: string
): MonitorChannelStatsItem[] {
  const selectedModel = String(modelFilter ?? '').trim();
  if (!selectedModel) {
    return items;
  }

  return items.flatMap((item) => {
    const models = (item.models || []).filter((model) => model.model === selectedModel);
    if (models.length === 0) {
      return [];
    }

    const totalRequests = models.reduce(
      (sum, model) => sum + toSafeMonitorNumber(model.requests),
      0
    );
    const successRequests = models.reduce(
      (sum, model) => sum + toSafeMonitorNumber(model.success),
      0
    );
    const failedRequests = models.reduce(
      (sum, model) => sum + toSafeMonitorNumber(model.failed),
      0
    );
    const inputTokens = models.reduce(
      (sum, model) => sum + toSafeMonitorNumber(model.input_tokens),
      0
    );
    const outputTokens = models.reduce(
      (sum, model) => sum + toSafeMonitorNumber(model.output_tokens),
      0
    );
    const cachedTokens = models.reduce(
      (sum, model) => sum + toSafeMonitorNumber(model.cached_tokens),
      0
    );
    const cacheWriteTokens = models.reduce(
      (sum, model) => sum + toSafeMonitorNumber(model.cache_write_tokens),
      0
    );
    const successRate = totalRequests > 0 ? (successRequests / totalRequests) * 100 : 0;
    const recentRequests = models
      .flatMap((model) => model.recent_requests || [])
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
    const lastRequestAt = models.reduce<string | undefined>((latest, model) => {
      if (!model.last_request_at) {
        return latest;
      }
      if (!latest || new Date(model.last_request_at).getTime() > new Date(latest).getTime()) {
        return model.last_request_at;
      }
      return latest;
    }, undefined);

    return [
      {
        ...item,
        total_requests: totalRequests,
        success_requests: successRequests,
        failed_requests: failedRequests,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_tokens: cachedTokens,
        cache_write_tokens: cacheWriteTokens,
        success_rate: successRate,
        last_request_at: lastRequestAt,
        recent_requests: recentRequests,
        models: models.map((model) => ({ ...model })),
      },
    ];
  });
}

export function applyMonitorFailureAnalysisModelFilter(
  items: MonitorFailureStatsItem[],
  modelFilter?: string
): MonitorFailureStatsItem[] {
  const selectedModel = String(modelFilter ?? '').trim();
  if (!selectedModel) {
    return items;
  }

  return items.flatMap((item) => {
    const models = (item.models || []).filter((model) => model.model === selectedModel);
    const failedCount = models.reduce((sum, model) => sum + toSafeMonitorNumber(model.failed), 0);

    if (models.length === 0 || failedCount <= 0) {
      return [];
    }

    const lastFailedAt =
      models
        .flatMap((model) => model.recent_requests || [])
        .filter((request) => request.failed)
        .map((request) => request.timestamp)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ||
      models.reduce<string | undefined>((latest, model) => {
        if (!model.last_request_at) {
          return latest;
        }
        if (!latest || new Date(model.last_request_at).getTime() > new Date(latest).getTime()) {
          return model.last_request_at;
        }
        return latest;
      }, undefined);

    return [
      {
        ...item,
        failed_count: failedCount,
        last_failed_at: lastFailedAt,
        models: models.map((model) => ({ ...model })),
      },
    ];
  });
}

/**
 * 禁用模型状态接口
 */
export interface DisableState {
  source: string;
  model: string;
  displayName: string;
  step: number;
}

/**
 * 脱敏 API Key
 * @param key API Key 字符串
 * @returns 脱敏后的字符串
 */
function maskSecret(key: string): string {
  if (!key || key === '-' || key === 'unknown') return key || '-';
  if (key.length <= 8) {
    return `${key.slice(0, 4)}***`;
  }
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

/**
 * 解析渠道名称（返回 provider 名称）
 * @param source 来源标识
 * @param providerMap 渠道映射表
 * @returns provider 名称或 null
 */
export function resolveProvider(
  source: string,
  providerMap: Record<string, string>
): string | null {
  if (!source || source === '-' || source === 'unknown') return null;

  // 首先尝试完全匹配
  if (providerMap[source]) {
    return providerMap[source];
  }

  // 然后尝试前缀匹配（双向）
  const entries = Object.entries(providerMap);
  for (const [key, provider] of entries) {
    if (source.startsWith(key) || key.startsWith(source)) {
      return provider;
    }
  }

  return null;
}

/**
 * 格式化 Gemini OAuth 来源（去掉后缀、前缀并脱敏）
 * @param source 来源标识（如 gemini-putthzli.json 或 xxx@gmail.com）
 * @returns 脱敏后的名称（如 g-put*zli）
 */
function formatGeminiSource(source: string): string {
  let name = source;

  // 去掉 @gmail.com 后缀（裸邮箱形式）
  if (name.toLowerCase().endsWith('@gmail.com')) {
    name = name.slice(0, -10);
  }

  // 去掉 .json 后缀
  if (name.toLowerCase().endsWith('.json')) {
    name = name.slice(0, -5);
  }

  // 去掉 gemini- 前缀
  if (name.toLowerCase().startsWith('gemini-')) {
    name = name.slice(7);
  }

  // 如果太短就直接返回
  if (name.length <= 6) {
    return `g-${name}`;
  }

  // 按 abc*jkh 格式显示（前3个字符 + * + 后3个字符）
  return `g-${name.slice(0, 3)}*${name.slice(-3)}`;
}

/**
 * 仅识别真正的 Gemini OAuth 来源。
 * 不得把所有 .json 凭证文件（codex-*.json / antigravity-*.json 等）当成 Gemini。
 */
function isGeminiOAuthSource(source: string): boolean {
  const lower = source.toLowerCase().trim();
  if (!lower) return false;

  // 标准 Gemini 凭证文件前缀
  if (lower.startsWith('gemini-') || lower.startsWith('gemini_')) {
    return true;
  }

  // 历史裸 Gmail 邮箱形式（无文件后缀、无其它 provider 前缀）
  if (
    lower.endsWith('@gmail.com') &&
    !lower.endsWith('.json') &&
    !lower.includes('/') &&
    !/^(codex|antigravity|claude|vertex|aistudio|qwen|iflow|xai|kimi)-/.test(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * 对凭证文件名做可读脱敏：去掉 .json，保留前缀与尾部。
 * API key 仍走 maskSecret。
 */
function maskAuthFileSource(source: string): string {
  let name = source;
  if (name.toLowerCase().endsWith('.json')) {
    name = name.slice(0, -5);
  }
  if (name.length <= 8) {
    return name;
  }
  if (name.length <= 16) {
    return `${name.slice(0, 4)}*${name.slice(-4)}`;
  }
  return `${name.slice(0, 6)}*${name.slice(-6)}`;
}

function isAuthFileSource(source: string): boolean {
  return source.toLowerCase().endsWith('.json');
}

function maskSourceForDisplay(source: string): string {
  return isAuthFileSource(source) ? maskAuthFileSource(source) : maskSecret(source);
}

/**
 * 格式化渠道显示名称：渠道名 (脱敏后的api-key)
 * @param source 来源标识
 * @param providerMap 渠道映射表
 * @returns 格式化后的显示名称
 */
export function formatProviderDisplay(source: string, providerMap: Record<string, string>): string {
  if (!source || source === '-' || source === 'unknown') {
    return source || '-';
  }

  // provider-map 优先：后端已把 OAuth 文件名映射到 Codex/Antigravity 等
  const provider = resolveProvider(source, providerMap);
  if (provider) {
    return `${provider} (${maskSourceForDisplay(source)})`;
  }

  // 仅在 map 未命中时，对真正的 Gemini OAuth 使用紧凑 g- 显示
  if (isGeminiOAuthSource(source)) {
    return formatGeminiSource(source);
  }

  return maskSourceForDisplay(source);
}

/**
 * 获取渠道显示信息（分离渠道名和秘钥）
 * @param source 来源标识
 * @param providerMap 渠道映射表
 * @returns 包含渠道名和秘钥的对象
 */
export function getProviderDisplayParts(
  source: string,
  providerMap: Record<string, string>
): { provider: string | null; masked: string } {
  if (!source || source === '-' || source === 'unknown') {
    return { provider: null, masked: source || '-' };
  }

  // provider-map 优先，避免把 codex/antigravity 等 .json 凭证误判为 Gemini
  const provider = resolveProvider(source, providerMap);
  if (provider) {
    return { provider, masked: maskSourceForDisplay(source) };
  }

  if (isGeminiOAuthSource(source)) {
    return { provider: null, masked: formatGeminiSource(source) };
  }

  return { provider: null, masked: maskSourceForDisplay(source) };
}

/**
 * 格式化时间戳为日期时间字符串
 * @param timestamp 时间戳（毫秒数或 ISO 字符串）
 * @returns 格式化后的日期时间字符串
 */
export function formatTimestamp(timestamp: number | string): string {
  if (!timestamp) return '-';
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 按 K/M 紧凑格式显示 token 数
 * @param value token 数值
 * @returns 紧凑格式字符串（如 12.4K、3.2M）
 */
export function formatCompactTokenNumber(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0';
  }

  const abs = Math.abs(num);
  const trimTrailingZero = (text: string) => text.replace(/\.0$/, '');

  if (abs >= 1_000_000) {
    const digits = abs >= 10_000_000 ? 0 : 1;
    return `${trimTrailingZero((num / 1_000_000).toFixed(digits))}M`;
  }

  if (abs >= 1_000) {
    const digits = abs >= 10_000 ? 0 : 1;
    return `${trimTrailingZero((num / 1_000).toFixed(digits))}K`;
  }

  return Math.round(num).toLocaleString('zh-CN');
}

export function computeUncachedInputTokens(
  inputTokens: number,
  cachedTokens: number,
  cacheWriteTokens = 0
): number {
  const input = toSafeMonitorNumber(inputTokens);
  const cached = toSafeMonitorNumber(cachedTokens);
  const cacheWrite = toSafeMonitorNumber(cacheWriteTokens);
  return Math.max(input - cached - cacheWrite, 0);
}

export function calculateMonitorRequestCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  cacheWriteTokens = 0
): number {
  return calculateModelCost(
    model,
    toSafeMonitorNumber(inputTokens),
    toSafeMonitorNumber(outputTokens),
    toSafeMonitorNumber(cachedTokens),
    toSafeMonitorNumber(cacheWriteTokens),
    { applyLongContextTier: true }
  );
}

export function calculateMonitorAggregateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  cacheWriteTokens = 0
): number {
  return calculateModelCost(
    model,
    toSafeMonitorNumber(inputTokens),
    toSafeMonitorNumber(outputTokens),
    toSafeMonitorNumber(cachedTokens),
    toSafeMonitorNumber(cacheWriteTokens),
    { applyLongContextTier: false }
  );
}

export function formatMonitorCost(cost: number): string {
  const value = toSafeMonitorNumber(cost);
  return value > 0 ? `$${value.toFixed(4)}` : '-';
}

const MIN_STREAM_OUTPUT_DURATION_MS = 1000;

export function computeEffectiveOutputDurationMs(latencyMs: number, ttftMs: number): number {
  const latency = toSafeMonitorNumber(latencyMs);
  const ttft = toSafeMonitorNumber(ttftMs);
  const streamOutputDuration = latency - ttft;

  if (latency <= 0) {
    return 0;
  }

  return ttft > 0 && streamOutputDuration >= MIN_STREAM_OUTPUT_DURATION_MS
    ? streamOutputDuration
    : latency;
}

export function formatOutputTokensPerSecond(
  outputTokens: number,
  latencyMs: number,
  ttftMs: number
): string {
  const output = toSafeMonitorNumber(outputTokens);
  const durationMs = computeEffectiveOutputDurationMs(latencyMs, ttftMs);

  if (output <= 0 || durationMs <= 0) {
    return '-';
  }

  return (output / (durationMs / 1000)).toFixed(1);
}

export function formatCacheTokenRatio(
  cachedTokens: number,
  inputTokens: number
): { count: string; ratio: string; title: string } {
  const cached = Number(cachedTokens);
  const input = Number(inputTokens);
  const safeCached = Number.isFinite(cached) ? cached : 0;
  const safeInput = Number.isFinite(input) ? input : 0;
  const ratio = safeInput > 0 ? (safeCached / safeInput) * 100 : 0;
  const ratioText = `${ratio.toFixed(1)}%`;
  const fullCount = Math.round(safeCached).toLocaleString('zh-CN');

  return {
    count: formatCompactTokenNumber(safeCached),
    ratio: ratioText,
    title: `${fullCount} / ${ratioText}`,
  };
}

/**
 * 获取成功率对应的样式类名
 * @param rate 成功率（0-100）
 * @param styles 样式模块对象
 * @returns 样式类名
 */
export function getRateClassName(rate: number, styles: Record<string, string>): string {
  if (rate >= 90) return styles.rateHigh || '';
  if (rate >= 70) return styles.rateMedium || '';
  return styles.rateLow || '';
}

/**
 * 创建禁用状态对象
 * @param source 来源标识
 * @param model 模型名称
 * @param providerMap 渠道映射表
 * @returns 禁用状态对象
 */
export function createDisableState(
  source: string,
  model: string,
  providerMap: Record<string, string>
): DisableState {
  const providerName = resolveProvider(source, providerMap);
  const displayName = providerName
    ? `${providerName} / ${model}`
    : `${maskSecret(source)} / ${model}`;
  return { source, model, displayName, step: 1 };
}
