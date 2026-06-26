import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REQUEST_LOG_FILTER_KEYS,
  REQUEST_LOG_TABLE_HEADER_KEYS,
  REQUEST_LOG_TABLE_COLUMN_KEYS,
  REQUEST_LOG_TABLE_COLUMN_WIDTHS,
  REQUEST_LOG_TABLE_MIN_WIDTH,
} from '../src/components/monitor/requestLogColumns.ts';
import { formatCacheTokenRatio } from '../src/utils/monitor.ts';

const requestLogsSource = readFileSync(
  new URL('../src/components/monitor/RequestLogs.tsx', import.meta.url),
  'utf8'
);

test('监控请求日志表格不展示请求 API、请求类型和成功率列', () => {
  assert.deepEqual(REQUEST_LOG_TABLE_COLUMN_KEYS, [
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
  ]);

  assert.equal(REQUEST_LOG_TABLE_COLUMN_KEYS.includes('api'), false);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_KEYS.includes('requestType'), false);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_KEYS.includes('count'), false);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_KEYS.includes('rate'), false);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_KEYS.includes('actions'), false);
});

test('监控请求日志表格列宽与列定义保持同步', () => {
  assert.deepEqual(Object.keys(REQUEST_LOG_TABLE_COLUMN_WIDTHS), REQUEST_LOG_TABLE_COLUMN_KEYS);

  const widthSum = Object.values(REQUEST_LOG_TABLE_COLUMN_WIDTHS).reduce(
    (sum, width) => sum + width,
    0
  );

  assert.equal(REQUEST_LOG_TABLE_MIN_WIDTH, widthSum);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_WIDTHS.source, 96);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_WIDTHS.output, 88);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_WIDTHS.cache, 88);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_WIDTHS.cacheRate, 88);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_WIDTHS.time, 180);
  assert.ok(REQUEST_LOG_TABLE_COLUMN_WIDTHS.time > REQUEST_LOG_TABLE_COLUMN_WIDTHS.output);
});

test('监控请求日志 token 列展示完整数字而非 K/M 紧凑格式', () => {
  assert.match(requestLogsSource, /case 'input':[\s\S]*\{formatNumber\(entry\.inputTokens\)\}/);
  assert.match(requestLogsSource, /case 'output':[\s\S]*\{formatNumber\(entry\.outputTokens\)\}/);
  assert.match(requestLogsSource, /case 'cache':[\s\S]*entry\.cachedTokens\s*>\s*0\s*\?\s*formatNumber\(entry\.cachedTokens\)\s*:\s*''/);
  assert.doesNotMatch(requestLogsSource, /formatCompactTokenNumber\(entry\.(inputTokens|outputTokens)\)/);
});

test('监控请求日志缓存数和缓存率分列显示', () => {
  assert.equal(REQUEST_LOG_TABLE_HEADER_KEYS.cache, 'monitor.logs.header_cache');
  assert.equal(REQUEST_LOG_TABLE_HEADER_KEYS.cacheRate, 'monitor.logs.header_cache_ratio');
  assert.match(requestLogsSource, /case 'cacheRate':[\s\S]*cache\.ratio/);
  assert.deepEqual(formatCacheTokenRatio(2500, 10000), {
    count: '2.5K',
    ratio: '25.0%',
    title: '2,500 / 25.0%',
  });
  assert.deepEqual(formatCacheTokenRatio(0, 0), {
    count: '0',
    ratio: '0.0%',
    title: '0 / 0.0%',
  });
});

test('监控请求日志缓存为 0 时缓存和缓存率显示为空白', () => {
  assert.match(requestLogsSource, /entry\.cachedTokens\s*>\s*0\s*\?\s*formatNumber\(entry\.cachedTokens\)\s*:\s*''/);
  assert.match(requestLogsSource, /entry\.cachedTokens\s*>\s*0\s*\?\s*cache\.ratio\s*:\s*''/);
});

test('监控请求日志数字列右对齐', () => {
  assert.match(requestLogsSource, /styles\.numberCell/);
  assert.match(requestLogsSource, /case 'toks':[\s\S]*styles\.numberCell/);
  assert.match(requestLogsSource, /case 'cacheRate':[\s\S]*styles\.numberCell/);
});

test('监控请求日志筛选条件不展示请求 API 和请求类型', () => {
  assert.deepEqual(REQUEST_LOG_FILTER_KEYS, ['model', 'source', 'status']);

  assert.equal(REQUEST_LOG_FILTER_KEYS.includes('api'), false);
  assert.equal(REQUEST_LOG_FILTER_KEYS.includes('requestType'), false);
});
