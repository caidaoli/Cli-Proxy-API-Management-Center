/**
 * 监控中心相关 API
 */

import { apiClient } from './client';

const MONITOR_TIMEOUT_MS = 60 * 1000;

export interface MonitorTimeRangeQuery {
  time_range?: string;
  start_time?: string;
  end_time?: string;
  api_filter?: string;
}

export interface MonitorFilterOptions {
  apis?: string[];
  models?: string[];
  sources?: string[];
}

export interface MonitorRecentRequest {
  failed: boolean;
  timestamp: string;
}

export interface MonitorRequestLogsQuery extends MonitorTimeRangeQuery {
  page?: number;
  page_size?: number;
  api?: string;
  api_key?: string;
  api_filter?: string;
  model?: string;
  source?: string;
  channel?: string;
  status?: '' | 'success' | 'failed';
}

export interface MonitorRequestLogItem {
  timestamp: string;
  api_key: string;
  model: string;
  source: string;
  auth_index: string;
  failed: boolean;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  request_count: number;
  success_rate: number;
  recent_requests: MonitorRecentRequest[];
}

export interface MonitorRequestLogsResponse {
  items: MonitorRequestLogItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_prev: boolean;
  has_next: boolean;
  filters?: MonitorFilterOptions;
  time_range?: {
    start_time?: string;
    end_time?: string;
  };
}

export interface MonitorStatsQuery extends MonitorTimeRangeQuery {
  limit?: number;
  api?: string;
  api_key?: string;
  api_filter?: string;
  model?: string;
  source?: string;
  channel?: string;
  status?: '' | 'success' | 'failed';
}

export interface MonitorModelStatsItem {
  model: string;
  requests: number;
  success: number;
  failed: number;
  success_rate: number;
  last_request_at?: string;
  recent_requests: MonitorRecentRequest[];
}

export interface MonitorChannelStatsItem {
  source: string;
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  success_rate: number;
  last_request_at?: string;
  recent_requests: MonitorRecentRequest[];
  models: MonitorModelStatsItem[];
}

export interface MonitorChannelStatsResponse {
  items: MonitorChannelStatsItem[];
  total: number;
  limit: number;
  filters?: MonitorFilterOptions;
  time_range?: {
    start_time?: string;
    end_time?: string;
  };
}

export interface MonitorFailureStatsItem {
  source: string;
  failed_count: number;
  last_failed_at?: string;
  models: MonitorModelStatsItem[];
}

export interface MonitorFailureAnalysisResponse {
  items: MonitorFailureStatsItem[];
  total: number;
  limit: number;
  filters?: MonitorFilterOptions;
  time_range?: {
    start_time?: string;
    end_time?: string;
  };
}

export interface MonitorKpiData {
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  success_rate: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  avg_tpm: number;
  avg_rpm: number;
  avg_rpd: number;
}

export interface MonitorModelDistributionItem {
  model: string;
  requests: number;
  tokens: number;
}

export interface MonitorDailyTrendItem {
  date: string;
  requests: number;
  success_requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
}

export interface MonitorHourlyModelsData {
  hours: string[];
  models: string[];
  model_data: Record<string, number[]>;
  success_rates: number[];
}

export interface MonitorHourlyTokensData {
  hours: string[];
  total_tokens: number[];
  input_tokens: number[];
  output_tokens: number[];
  reasoning_tokens: number[];
  cached_tokens: number[];
}

export const monitorApi = {
  getRequestLogs: (params: MonitorRequestLogsQuery = {}) =>
    apiClient.get<MonitorRequestLogsResponse>('/custom/monitor/request-logs', {
      params,
      timeout: MONITOR_TIMEOUT_MS,
    }),

  getChannelStats: (params: MonitorStatsQuery = {}) =>
    apiClient.get<MonitorChannelStatsResponse>('/custom/monitor/channel-stats', {
      params,
      timeout: MONITOR_TIMEOUT_MS,
    }),

  getFailureAnalysis: (params: MonitorStatsQuery = {}) =>
    apiClient.get<MonitorFailureAnalysisResponse>('/custom/monitor/failure-analysis', {
      params,
      timeout: MONITOR_TIMEOUT_MS,
    }),

  getKpi: (params: MonitorTimeRangeQuery = {}) =>
    apiClient.get<MonitorKpiData>('/custom/monitor/kpi', { params, timeout: MONITOR_TIMEOUT_MS }),

  getModelDistribution: (params: MonitorTimeRangeQuery & { sort?: 'requests' | 'tokens'; limit?: number } = {}) =>
    apiClient.get<{ items: MonitorModelDistributionItem[] }>('/custom/monitor/model-distribution', { params, timeout: MONITOR_TIMEOUT_MS }),

  getDailyTrend: (params: MonitorTimeRangeQuery = {}) =>
    apiClient.get<{ items: MonitorDailyTrendItem[] }>('/custom/monitor/daily-trend', { params, timeout: MONITOR_TIMEOUT_MS }),

  getHourlyModels: (params: MonitorTimeRangeQuery & { hours?: number; limit?: number } = {}) =>
    apiClient.get<MonitorHourlyModelsData>('/custom/monitor/hourly-models', { params, timeout: MONITOR_TIMEOUT_MS }),

  getHourlyTokens: (params: MonitorTimeRangeQuery & { hours?: number } = {}) =>
    apiClient.get<MonitorHourlyTokensData>('/custom/monitor/hourly-tokens', { params, timeout: MONITOR_TIMEOUT_MS }),
};
