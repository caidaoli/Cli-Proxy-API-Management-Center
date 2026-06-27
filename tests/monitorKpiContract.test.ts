import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMonitorChannelStatsModelFilter,
  applyMonitorFailureAnalysisModelFilter,
  computeUncachedInputTokens,
  formatOutputTokensPerSecond,
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

test('监控输入 token 展示扣除缓存命中部分', () => {
  assert.equal(computeUncachedInputTokens(42504, 36605), 5899);
  assert.equal(computeUncachedInputTokens(1000, 0), 1000);
  assert.equal(computeUncachedInputTokens(1000, 1200), 0);
  assert.equal(computeUncachedInputTokens(Number.NaN, 100), 0);
});

test('监控 Tok/s 按有效输出耗时计算', () => {
  assert.equal(formatOutputTokensPerSecond(100, 5000, 2000), '33.3');
  assert.equal(formatOutputTokensPerSecond(100, 1500, 800), '66.7');
  assert.equal(formatOutputTokensPerSecond(100, 4000, 0), '25.0');
  assert.equal(formatOutputTokensPerSecond(0, 4000, 0), '-');
  assert.equal(formatOutputTokensPerSecond(100, 0, 0), '-');
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

test('渠道统计按选中模型过滤展开行并重算渠道汇总', () => {
  const raw = [
    {
      source: 'yga-key',
      total_requests: 467,
      success_requests: 445,
      failed_requests: 22,
      input_tokens: 5_117_000,
      output_tokens: 213_700,
      cached_tokens: 43_002_000,
      success_rate: 95.3,
      last_request_at: '2026-06-27T08:10:08Z',
      recent_requests: [{ failed: false, timestamp: '2026-06-27T08:10:08Z' }],
      models: [
        {
          model: 'gpt-5.5',
          requests: 458,
          success: 436,
          failed: 22,
          input_tokens: 5_100_000,
          output_tokens: 209_000,
          cached_tokens: 43_000_000,
          success_rate: 95.2,
          last_request_at: '2026-06-27T07:54:35Z',
          recent_requests: [{ failed: true, timestamp: '2026-06-27T07:54:35Z' }],
        },
        {
          model: 'gpt-5.4-mini',
          requests: 9,
          success: 9,
          failed: 0,
          input_tokens: 17_000,
          output_tokens: 4_700,
          cached_tokens: 2_700,
          success_rate: 100,
          last_request_at: '2026-06-27T08:10:08Z',
          recent_requests: [{ failed: false, timestamp: '2026-06-27T08:10:08Z' }],
        },
      ],
    },
    {
      source: 'other-key',
      total_requests: 1,
      success_requests: 1,
      failed_requests: 0,
      input_tokens: 100,
      output_tokens: 20,
      cached_tokens: 0,
      success_rate: 100,
      last_request_at: '2026-06-27T08:11:00Z',
      recent_requests: [{ failed: false, timestamp: '2026-06-27T08:11:00Z' }],
      models: [
        {
          model: 'gpt-5.5',
          requests: 1,
          success: 1,
          failed: 0,
          input_tokens: 100,
          output_tokens: 20,
          cached_tokens: 0,
          success_rate: 100,
          last_request_at: '2026-06-27T08:11:00Z',
          recent_requests: [{ failed: false, timestamp: '2026-06-27T08:11:00Z' }],
        },
      ],
    },
  ];

  const filtered = applyMonitorChannelStatsModelFilter(raw, 'gpt-5.4-mini');

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].source, 'yga-key');
  assert.deepEqual(
    filtered[0].models.map((model) => model.model),
    ['gpt-5.4-mini']
  );
  assert.equal(filtered[0].total_requests, 9);
  assert.equal(filtered[0].success_requests, 9);
  assert.equal(filtered[0].failed_requests, 0);
  assert.equal(filtered[0].input_tokens, 17_000);
  assert.equal(filtered[0].output_tokens, 4_700);
  assert.equal(filtered[0].cached_tokens, 2_700);
  assert.equal(filtered[0].success_rate, 100);
  assert.equal(filtered[0].last_request_at, '2026-06-27T08:10:08Z');
  assert.deepEqual(filtered[0].recent_requests, [
    { failed: false, timestamp: '2026-06-27T08:10:08Z' },
  ]);
  assert.equal(raw[0].total_requests, 467);
  assert.equal(raw[0].models.length, 2);
});

test('失败来源分析按选中模型过滤展开行并重算失败汇总', () => {
  const raw = [
    {
      source: 'yga-key',
      failed_count: 23,
      last_failed_at: '2026-06-27T08:10:08Z',
      models: [
        {
          model: 'gpt-5.5',
          requests: 458,
          success: 436,
          failed: 22,
          input_tokens: 5_100_000,
          output_tokens: 209_000,
          cached_tokens: 43_000_000,
          success_rate: 95.2,
          last_request_at: '2026-06-27T07:54:35Z',
          recent_requests: [{ failed: true, timestamp: '2026-06-27T07:54:35Z' }],
        },
        {
          model: 'gpt-5.4-mini',
          requests: 9,
          success: 8,
          failed: 1,
          input_tokens: 17_000,
          output_tokens: 4_700,
          cached_tokens: 2_700,
          success_rate: 88.9,
          last_request_at: '2026-06-27T08:10:08Z',
          recent_requests: [{ failed: true, timestamp: '2026-06-27T08:10:08Z' }],
        },
      ],
    },
    {
      source: 'other-key',
      failed_count: 2,
      last_failed_at: '2026-06-27T08:11:00Z',
      models: [
        {
          model: 'gpt-5.4-mini',
          requests: 4,
          success: 4,
          failed: 0,
          input_tokens: 100,
          output_tokens: 20,
          cached_tokens: 0,
          success_rate: 100,
          last_request_at: '2026-06-27T08:11:00Z',
          recent_requests: [{ failed: false, timestamp: '2026-06-27T08:11:00Z' }],
        },
        {
          model: 'gpt-5.5',
          requests: 2,
          success: 0,
          failed: 2,
          input_tokens: 100,
          output_tokens: 20,
          cached_tokens: 0,
          success_rate: 0,
          last_request_at: '2026-06-27T08:11:00Z',
          recent_requests: [{ failed: true, timestamp: '2026-06-27T08:11:00Z' }],
        },
      ],
    },
  ];

  const filtered = applyMonitorFailureAnalysisModelFilter(raw, 'gpt-5.4-mini');

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].source, 'yga-key');
  assert.equal(filtered[0].failed_count, 1);
  assert.equal(filtered[0].last_failed_at, '2026-06-27T08:10:08Z');
  assert.deepEqual(
    filtered[0].models.map((model) => model.model),
    ['gpt-5.4-mini']
  );
  assert.equal(raw[0].failed_count, 23);
  assert.equal(raw[0].models.length, 2);
});
