export const REQUEST_LOG_TABLE_COLUMN_KEYS = [
  'auth',
  'model',
  'source',
  'status',
  'recent',
  'timing',
  'toks',
  'input',
  'output',
  'cache',
  'cacheRate',
  'time',
] as const;

export const REQUEST_LOG_FILTER_KEYS = ['model', 'source', 'status'] as const;

export type RequestLogTableColumnKey = (typeof REQUEST_LOG_TABLE_COLUMN_KEYS)[number];
export type RequestLogFilterKey = (typeof REQUEST_LOG_FILTER_KEYS)[number];

export const REQUEST_LOG_TABLE_COLUMN_WIDTHS: Record<RequestLogTableColumnKey, number> = {
  auth: 100,
  model: 160,
  source: 96,
  status: 70,
  recent: 110,
  timing: 120,
  toks: 70,
  input: 88,
  output: 88,
  cache: 88,
  cacheRate: 88,
  time: 180,
};

export const REQUEST_LOG_TABLE_MIN_WIDTH = Object.values(REQUEST_LOG_TABLE_COLUMN_WIDTHS).reduce(
  (sum, width) => sum + width,
  0
);

export const REQUEST_LOG_TABLE_HEADER_KEYS: Record<RequestLogTableColumnKey, string> = {
  auth: 'monitor.logs.header_auth',
  model: 'monitor.logs.header_model',
  source: 'monitor.logs.header_source',
  status: 'monitor.logs.header_status',
  recent: 'monitor.logs.header_recent',
  timing: 'monitor.logs.header_timing',
  toks: 'monitor.logs.header_toks',
  input: 'monitor.logs.header_input',
  output: 'monitor.logs.header_output',
  cache: 'monitor.logs.header_cache',
  cacheRate: 'monitor.logs.header_cache_ratio',
  time: 'monitor.logs.header_time',
};
