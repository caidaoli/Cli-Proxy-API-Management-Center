import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMonitorChannelStatsModelFilter,
  applyMonitorFailureAnalysisModelFilter,
  buildMonitorChannelDistributionItems,
  buildMonitorModelDistributionItems,
  calculateMonitorAggregateCost,
  calculateMonitorRequestCost,
  computeUncachedInputTokens,
  formatMonitorCost,
  formatOutputTokensPerSecond,
  formatMonitorNumber,
  mergeMonitorFilterOptions,
  normalizeMonitorHourlyModelsData,
  normalizeMonitorHourlyTokensData,
  normalizeMonitorKpiData,
} from '../src/utils/monitor.ts';
import { calculateModelCost } from '../src/utils/costCalculator.ts';
import {
  claudeModelPricing,
  geminiModelPricing,
  openAIModelPricing,
  xAIModelPricing,
  type ModelPricing,
} from '../src/data/modelPricing.generated.ts';

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
    cache_write_tokens: 0,
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

test('监控输入 token 展示同时扣除缓存读取和缓存写入部分', () => {
  assert.equal(computeUncachedInputTokens(42504, 36605), 5899);
  assert.equal(computeUncachedInputTokens(1000, 200, 300), 500);
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

test('监控费用按模型价格和缓存 token 计算', () => {
  assert.equal(calculateMonitorRequestCost('gpt-5.5', 2_000_000, 1_000_000, 1_000_000), 56);
  assert.equal(calculateMonitorRequestCost('gemini-3.1-pro', 300_000, 100_000, 50_000), 2.82);
  assert.equal(
    calculateMonitorRequestCost('claude-sonnet-4-5-20250929', 2_000_000, 1_000_000, 1_000_000),
    18.3
  );
  assert.equal(calculateMonitorRequestCost('unknown-model', 1_000_000, 1_000_000, 0), 0);
});

test('OpenAI 费用包含 cache write 且按总输入扣除缓存 token', () => {
  assert.equal(calculateModelCost('gpt-5.6', 200_000, 100_000, 50_000, 50_000), 3.8375);
  assert.equal(calculateMonitorRequestCost('gpt-5.6', 200_000, 100_000, 50_000, 50_000), 3.8375);
  assert.equal(calculateMonitorAggregateCost('gpt-5.6', 200_000, 100_000, 50_000, 50_000), 3.8375);
});

test('OpenAI 长上下文阶梯价覆盖 cache read 和 cache write', () => {
  assert.equal(calculateModelCost('gpt-5.6', 400_000, 100_000, 100_000, 100_000), 7.85);
});

test('models.dev OpenAI 快照包含 o-series、embedding 和精确 Codex 价格', () => {
  assert.equal(calculateModelCost('o3', 1_000_000, 1_000_000), 10);
  assert.equal(calculateModelCost('text-embedding-3-large', 1_000_000, 0), 0.13);
  assert.equal(calculateModelCost('gpt-5.2-codex', 1_000_000, 1_000_000), 15.75);
});

test('models.dev 四家价格快照中的每个模型都参与费用计算', () => {
  const tables: Array<[string, Record<string, ModelPricing>]> = [
    ['Gemini', geminiModelPricing],
    ['OpenAI', openAIModelPricing],
    ['Claude', claudeModelPricing],
    ['xAI', xAIModelPricing],
  ];

  for (const [provider, table] of tables) {
    assert.ok(Object.keys(table).length > 0, `${provider} price table must not be empty`);
    for (const [model, pricing] of Object.entries(table)) {
      const actual = calculateModelCost(model, 1_000_000, 1_000_000, 0, 0, {
        applyLongContextTier: false,
      });
      const expected = pricing.inputPrice + pricing.outputPrice;
      assert.ok(Math.abs(actual - expected) < 1e-10, `${provider}:${model}`);
    }
  }
});

test('xAI context tier 使用生成快照中的阈值和高阶价格', () => {
  const tierEntry = Object.entries(xAIModelPricing).find(
    ([, pricing]) =>
      pricing.tierThreshold !== undefined && pricing.inputPriceHigh !== undefined
  );
  assert.ok(tierEntry, 'xAI snapshot must include a context-tier model');

  const [model, pricing] = tierEntry;
  const inputTokens = pricing.tierThreshold + 1;
  const expected = (inputTokens * pricing.inputPriceHigh) / 1_000_000;
  assert.equal(calculateModelCost(model, inputTokens, 0), expected);
});

test('已下架模型继续使用明确的历史价格 fallback', () => {
  assert.equal(calculateModelCost('claude-3-haiku', 1_000_000, 1_000_000), 1.5);
  assert.equal(calculateModelCost('gemini-1.5-flash', 1_000_000, 1_000_000), 0.8);
});

test('观测到的 Gemini 名称映射到 canonical preview 定价', () => {
  const aliasCost = calculateModelCost('gemini-3.1-pro', 1_000_000, 1_000_000, 0, 0, {
    applyLongContextTier: false,
  });
  const canonicalCost = calculateModelCost(
    'gemini-3.1-pro-preview',
    1_000_000,
    1_000_000,
    0,
    0,
    { applyLongContextTier: false }
  );
  assert.equal(aliasCost, canonicalCost);
});

test('gemini-3-flash-agent 使用 gemini-3.5-flash 定价', () => {
  const observedCost = calculateMonitorRequestCost('gemini-3-flash-agent', 1_000_000, 1_000_000, 0);
  const canonicalCost = calculateMonitorRequestCost('gemini-3.5-flash', 1_000_000, 1_000_000, 0);

  assert.equal(observedCost, canonicalCost);
});

test('缓存 token 超过输入 token 时普通输入费用归零', () => {
  assert.equal(calculateModelCost('gpt-5.6', 100, 0, 200, 300), 0.001975);
});

test('监控聚合费用不按累计 token 触发长上下文阶梯价', () => {
  assert.equal(calculateMonitorRequestCost('gpt-5.5', 3_715_000, 15_000, 3_200_000), 9.025);
  assert.equal(calculateMonitorAggregateCost('gpt-5.5', 3_715_000, 15_000, 3_200_000), 4.625);
});

test('监控费用格式化固定使用美元短格式', () => {
  assert.equal(formatMonitorCost(35.5), '$35.5000');
  assert.equal(formatMonitorCost(0.012345), '$0.0123');
  assert.equal(formatMonitorCost(0), '-');
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
    cache_write_tokens: [],
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
      cache_write_tokens: 102_000,
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
          cache_write_tokens: 100_000,
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
          cache_write_tokens: 2_000,
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
      cache_write_tokens: 0,
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
          cache_write_tokens: 0,
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
  assert.equal(filtered[0].cache_write_tokens, 2_000);
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

test('监控筛选项在任一渠道或模型筛选激活时保留原始可选集合', () => {
  const previous = {
    channels: ['alpha-key', 'beta-key', 'gamma-key'],
    models: ['gpt-5.5', 'gpt-5.4-mini'],
  };
  const narrowed = {
    channels: ['alpha-key'],
    models: ['gpt-5.5'],
  };

  assert.deepEqual(
    mergeMonitorFilterOptions(previous, narrowed, { channel: 'alpha-key' }),
    previous
  );

  assert.deepEqual(mergeMonitorFilterOptions(previous, narrowed, { model: 'gpt-5.5' }), previous);

  assert.deepEqual(
    mergeMonitorFilterOptions(previous, narrowed, { channel: 'alpha-key', model: 'gpt-5.5' }),
    previous
  );

  assert.deepEqual(mergeMonitorFilterOptions(previous, narrowed, {}), narrowed);
});

test('渠道用量分布按 Token 或费用生成 Top 项并格式化渠道名', () => {
  const items = [
    {
      source: 'sk-alpha1234',
      total_requests: 8,
      success_requests: 8,
      failed_requests: 0,
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cached_tokens: 40,
      success_rate: 100,
      recent_requests: [],
      models: [
        {
          model: 'gpt-5.5',
          requests: 8,
          success: 8,
          failed: 0,
          input_tokens: 1_000_000,
          output_tokens: 500_000,
          cached_tokens: 40,
          success_rate: 100,
          recent_requests: [],
        },
      ],
    },
    {
      source: 'plainchannel',
      total_requests: 3,
      success_requests: 3,
      failed_requests: 0,
      input_tokens: 400_000,
      output_tokens: 10_000,
      cached_tokens: 300,
      success_rate: 100,
      recent_requests: [],
      models: [
        {
          model: 'gpt-5-mini',
          requests: 3,
          success: 3,
          failed: 0,
          input_tokens: 400_000,
          output_tokens: 10_000,
          cached_tokens: 300,
          success_rate: 100,
          recent_requests: [],
        },
      ],
    },
  ];

  assert.deepEqual(
    buildMonitorChannelDistributionItems(items, { 'sk-alpha1234': 'OpenAI' }, 'token', 2),
    [
      { label: 'OpenAI (sk-a***1234)', tokens: 1_500_000, cost: 19.99982 },
      { label: 'plai***nnel', tokens: 410_000, cost: 0.1199325 },
    ]
  );

  assert.deepEqual(
    buildMonitorChannelDistributionItems(items, { 'sk-alpha1234': 'OpenAI' }, 'cost', 1),
    [{ label: 'OpenAI (sk-a***1234)', tokens: 1_500_000, cost: 19.99982 }]
  );
});

test('渠道用量分布超过九个渠道时聚合为其他', () => {
  const items = Array.from({ length: 12 }, (_, index) => {
    const rank = 12 - index;

    return {
      source: `channel-${rank}`,
      total_requests: rank,
      success_requests: rank,
      failed_requests: 0,
      input_tokens: rank * 10,
      output_tokens: rank,
      cached_tokens: 0,
      success_rate: 100,
      recent_requests: [],
      models: [],
    };
  });

  const distribution = buildMonitorChannelDistributionItems(items, {}, 'token', 10, '其他');

  assert.equal(distribution.length, 10);
  assert.deepEqual(
    distribution.slice(0, 9).map((item) => item.tokens),
    [132, 121, 110, 99, 88, 77, 66, 55, 44]
  );
  assert.deepEqual(distribution[9], {
    label: '其他',
    tokens: 66,
    cost: 0,
  });
});

test('模型用量分布从渠道模型明细聚合 Token 和费用', () => {
  const items = [
    {
      source: 'channel-a',
      total_requests: 2,
      success_requests: 2,
      failed_requests: 0,
      input_tokens: 1_700_000,
      output_tokens: 600_000,
      cached_tokens: 50_000,
      success_rate: 100,
      recent_requests: [],
      models: [
        {
          model: 'gpt-5.5',
          requests: 1,
          success: 1,
          failed: 0,
          input_tokens: 1_000_000,
          output_tokens: 500_000,
          cached_tokens: 0,
          success_rate: 100,
          recent_requests: [],
        },
        {
          model: 'gpt-5-mini',
          requests: 1,
          success: 1,
          failed: 0,
          input_tokens: 700_000,
          output_tokens: 100_000,
          cached_tokens: 50_000,
          success_rate: 100,
          recent_requests: [],
        },
      ],
    },
    {
      source: 'channel-b',
      total_requests: 1,
      success_requests: 1,
      failed_requests: 0,
      input_tokens: 500_000,
      output_tokens: 100_000,
      cached_tokens: 0,
      success_rate: 100,
      recent_requests: [],
      models: [
        {
          model: 'gpt-5.5',
          requests: 1,
          success: 1,
          failed: 0,
          input_tokens: 500_000,
          output_tokens: 100_000,
          cached_tokens: 0,
          success_rate: 100,
          recent_requests: [],
        },
      ],
    },
  ];

  assert.deepEqual(buildMonitorModelDistributionItems(items, 'cost', 2), [
    { label: 'gpt-5.5', tokens: 2_100_000, cost: 25.5 },
    { label: 'gpt-5-mini', tokens: 800_000, cost: 0.36375 },
  ]);
});

test('渠道和模型费用分布包含 cache write 成本', () => {
  const items = [
    {
      source: 'openai-key',
      total_requests: 1,
      success_requests: 1,
      failed_requests: 0,
      input_tokens: 200_000,
      output_tokens: 100_000,
      cached_tokens: 50_000,
      cache_write_tokens: 50_000,
      success_rate: 100,
      recent_requests: [],
      models: [
        {
          model: 'gpt-5.6',
          requests: 1,
          success: 1,
          failed: 0,
          input_tokens: 200_000,
          output_tokens: 100_000,
          cached_tokens: 50_000,
          cache_write_tokens: 50_000,
          success_rate: 100,
          recent_requests: [],
        },
      ],
    },
  ];

  assert.deepEqual(buildMonitorChannelDistributionItems(items, {}, 'cost'), [
    { label: 'open***-key', tokens: 300_000, cost: 3.8375 },
  ]);
  assert.deepEqual(buildMonitorModelDistributionItems(items, 'cost'), [
    { label: 'gpt-5.6', tokens: 300_000, cost: 3.8375 },
  ]);
});
