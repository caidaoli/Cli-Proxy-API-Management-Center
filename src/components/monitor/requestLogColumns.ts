export const REQUEST_LOG_TABLE_COLUMN_KEYS = [
  'auth',
  'model',
  'source',
  'status',
  'recent',
  'rate',
  'count',
  'input',
  'output',
  'cache',
  'time',
  'actions',
] as const;

export const REQUEST_LOG_FILTER_KEYS = ['model', 'source', 'status'] as const;

export type RequestLogTableColumnKey = (typeof REQUEST_LOG_TABLE_COLUMN_KEYS)[number];
export type RequestLogFilterKey = (typeof REQUEST_LOG_FILTER_KEYS)[number];

export const REQUEST_LOG_TABLE_HEADER_KEYS: Record<RequestLogTableColumnKey, string> = {
  auth: 'monitor.logs.header_auth',
  model: 'monitor.logs.header_model',
  source: 'monitor.logs.header_source',
  status: 'monitor.logs.header_status',
  recent: 'monitor.logs.header_recent',
  rate: 'monitor.logs.header_rate',
  count: 'monitor.logs.header_count',
  input: 'monitor.logs.header_input',
  output: 'monitor.logs.header_output',
  cache: 'monitor.logs.header_cache',
  time: 'monitor.logs.header_time',
  actions: 'monitor.logs.header_actions',
};
