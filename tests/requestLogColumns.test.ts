import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_LOG_FILTER_KEYS,
  REQUEST_LOG_TABLE_COLUMN_KEYS,
} from '../src/components/monitor/requestLogColumns.ts';

test('监控请求日志表格不展示请求 API 和请求类型列', () => {
  assert.deepEqual(REQUEST_LOG_TABLE_COLUMN_KEYS, [
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
  ]);

  assert.equal(REQUEST_LOG_TABLE_COLUMN_KEYS.includes('api'), false);
  assert.equal(REQUEST_LOG_TABLE_COLUMN_KEYS.includes('requestType'), false);
});

test('监控请求日志筛选条件不展示请求 API 和请求类型', () => {
  assert.deepEqual(REQUEST_LOG_FILTER_KEYS, ['model', 'source', 'status']);

  assert.equal(REQUEST_LOG_FILTER_KEYS.includes('api'), false);
  assert.equal(REQUEST_LOG_FILTER_KEYS.includes('requestType'), false);
});
