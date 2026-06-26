import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatMonitorNumber,
  normalizeMonitorHourlyModelsData,
  normalizeMonitorHourlyTokensData,
  normalizeMonitorKpiData,
} from '../src/utils/monitor.ts';

test('监控 KPI 响应缺少数字字段时归一化为 0', () => {
  const normalized = normalizeMonitorKpiData({
    total_requests: 12,
    success_requests: 9,
    failed_requests: 3,
    success_rate: 75,
    total_tokens: 12345,
  });

  assert.deepEqual(normalized, {
    total_requests: 12,
    success_requests: 9,
    failed_requests: 3,
    success_rate: 75,
    total_tokens: 12345,
    input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    cached_tokens: 0,
    avg_tpm: 0,
    avg_rpm: 0,
    avg_rpd: 0,
  });
});

test('监控 KPI 空响应保持为空数据', () => {
  assert.equal(normalizeMonitorKpiData({}), null);
  assert.equal(normalizeMonitorKpiData(null), null);
});

test('监控 KPI 数字格式化接受 undefined 和非数字脏值', () => {
  assert.equal(formatMonitorNumber(undefined), '0');
  assert.equal(formatMonitorNumber(Number.NaN), '0');
  assert.equal(formatMonitorNumber('1234'), '1.23K');
});

test('KpiCards 渲染前重新归一化 KPI 数据', () => {
  const source = readFileSync(
    new URL('../src/components/monitor/KpiCards.tsx', import.meta.url),
    'utf8'
  );

  assert.match(source, /normalizeMonitorKpiData/);
  assert.match(source, /const stats = normalizeMonitorKpiData\(kpiData\)/);
});

test('小时图响应缺少数组字段时归一化为空数据', () => {
  assert.deepEqual(normalizeMonitorHourlyModelsData({ hours: ['2026-06-26T12:00:00Z'] }), {
    hours: ['2026-06-26T12:00:00Z'],
    models: [],
    model_data: {},
    success_rates: [],
  });

  assert.deepEqual(normalizeMonitorHourlyTokensData({ total_tokens: [1200] }), {
    hours: [],
    total_tokens: [1200],
    input_tokens: [],
    output_tokens: [],
    reasoning_tokens: [],
    cached_tokens: [],
  });
});
