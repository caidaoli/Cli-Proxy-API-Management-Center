/**
 * 监控中心公共工具函数
 */

import type { MonitorTimeRangeQuery } from '@/services/api/monitor';

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
export function maskSecret(key: string): string {
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
 * 格式化 Gemini OAuth 文件名（去掉后缀、前缀并脱敏）
 * @param source 来源标识（如 gemini-putthzli.json 或 xxx@gmail.com）
 * @returns 脱敏后的名称（如 g-put*zli）
 */
export function formatGeminiSource(source: string): string {
  const lower = source.toLowerCase();
  // 判断是否是 gemini 类型（gemini- 开头或 .json 结尾）
  const isGeminiType = lower.startsWith('gemini-') || lower.endsWith('.json');

  let name = source;

  // 去掉 @gmail.com 后缀
  if (lower.endsWith('@gmail.com')) {
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

  // 确定前缀
  const prefix = isGeminiType ? 'g-' : '';

  // 如果太短就直接返回
  if (name.length <= 6) {
    return `${prefix}${name}`;
  }

  // 按 abc*jkh 格式显示（前3个字符 + * + 后3个字符）
  return `${prefix}${name.slice(0, 3)}*${name.slice(-3)}`;
}

/**
 * 检查是否是 Gemini OAuth 类型的来源
 * @param source 来源标识
 * @returns 是否是 Gemini OAuth 类型
 */
function isGeminiOAuthSource(source: string): boolean {
  const lower = source.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('@gmail.com');
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

  // 检查是否是 gemini 类型（OAuth 文件或 Gmail 账号）
  if (isGeminiOAuthSource(source)) {
    return formatGeminiSource(source);
  }

  const provider = resolveProvider(source, providerMap);
  const masked = maskSecret(source);
  if (!provider) return masked;
  return `${provider} (${masked})`;
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

  // 检查是否是 gemini 类型（OAuth 文件或 Gmail 账号）
  if (isGeminiOAuthSource(source)) {
    const formatted = formatGeminiSource(source);
    return { provider: null, masked: formatted };
  }

  const provider = resolveProvider(source, providerMap);
  const masked = maskSecret(source);
  return { provider, masked };
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
 * 检查模型是否在配置中可用（未被移除）
 * @param source 来源标识
 * @param modelAlias 模型别名
 * @param providerModels 渠道模型映射表
 * @returns 是否可用
 */
export function isModelEnabled(
  source: string,
  modelAlias: string,
  providerModels: Record<string, Set<string>>
): boolean {
  if (!source || !modelAlias) return true; // 无法判断时默认显示
  // 首先尝试完全匹配
  if (providerModels[source]) {
    return providerModels[source].has(modelAlias);
  }
  // 然后尝试前缀匹配
  const entries = Object.entries(providerModels);
  for (const [key, modelSet] of entries) {
    if (source.startsWith(key) || key.startsWith(source)) {
      return modelSet.has(modelAlias);
    }
  }
  return true; // 找不到渠道配置时默认显示
}

/**
 * 检查模型是否已禁用（会话中禁用或配置中已移除）
 * @param source 来源标识
 * @param model 模型名称
 * @param disabledModels 已禁用模型集合
 * @param providerModels 渠道模型映射表
 * @returns 是否已禁用
 */
export function isModelDisabled(
  source: string,
  model: string,
  disabledModels: Set<string>,
  providerModels: Record<string, Set<string>>
): boolean {
  // 首先检查会话中是否已禁用
  if (disabledModels.has(`${source}|||${model}`)) {
    return true;
  }
  // 然后检查配置中是否已移除
  return !isModelEnabled(source, model, providerModels);
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

