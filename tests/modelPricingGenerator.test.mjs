import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelPricingSnapshot,
  serializeModelPricingSnapshot,
} from '../scripts/update-model-pricing.mjs';

const pricedModel = (cost) => ({ cost });

const buildValidPayload = () => ({
  google: {
    models: {
      'gemini-test': pricedModel({
        input: 1,
        output: 2,
        cache_read: 0.1,
        cache_write: 1.25,
        tiers: [
          {
            input: 2,
            output: 3,
            cache_read: 0.2,
            cache_write: 2.5,
            tier: { type: 'context', size: 200_000 },
          },
        ],
      }),
    },
  },
  openai: { models: { 'gpt-test': pricedModel({ input: 3, output: 4 }) } },
  anthropic: { models: { 'claude-test': pricedModel({ input: 5, output: 6 }) } },
  xai: { models: { 'grok-test': pricedModel({ input: 7, output: 8 }) } },
});

test('四个 canonical provider 转换为具名价格表', () => {
  const snapshot = buildModelPricingSnapshot(buildValidPayload());

  assert.deepEqual(Object.keys(snapshot), [
    'geminiModelPricing',
    'openAIModelPricing',
    'claudeModelPricing',
    'xAIModelPricing',
  ]);
  assert.deepEqual(snapshot.geminiModelPricing['gemini-test'], {
    inputPrice: 1,
    outputPrice: 2,
    cacheReadPrice: 0.1,
    cacheWritePrice: 1.25,
    tierThreshold: 200_000,
    inputPriceHigh: 2,
    outputPriceHigh: 3,
    cacheReadPriceHigh: 0.2,
    cacheWritePriceHigh: 2.5,
  });
  assert.equal(snapshot.openAIModelPricing['gpt-test'].inputPrice, 3);
  assert.equal(snapshot.claudeModelPricing['claude-test'].outputPrice, 6);
  assert.equal(snapshot.xAIModelPricing['grok-test'].inputPrice, 7);
});

test('序列化结果暴露四个稳定导出', () => {
  const source = serializeModelPricingSnapshot(buildModelPricingSnapshot(buildValidPayload()));

  assert.match(source, /export interface ModelPricing/);
  for (const exportName of [
    'geminiModelPricing',
    'openAIModelPricing',
    'claudeModelPricing',
    'xAIModelPricing',
  ]) {
    assert.match(source, new RegExp(`export const ${exportName} =`));
  }
});

test('任一 provider 缺失或没有有效价格时整体失败', () => {
  const missingProvider = buildValidPayload();
  delete missingProvider.xai;
  assert.throws(() => buildModelPricingSnapshot(missingProvider), /xai\.models/);

  const emptyProvider = buildValidPayload();
  emptyProvider.anthropic.models = { 'claude-unpriced': {} };
  assert.throws(
    () => buildModelPricingSnapshot(emptyProvider),
    /no priced models for anthropic/
  );
});

test('非法价格报告 provider、模型和字段路径', () => {
  const payload = buildValidPayload();
  payload.openai.models['gpt-test'].cost.input = -1;

  assert.throws(
    () => buildModelPricingSnapshot(payload),
    /openai\.models\.gpt-test\.cost\.input/
  );

  const invalidTier = buildValidPayload();
  invalidTier.google.models['gemini-test'].cost.tiers[0].tier.size = Number.NaN;
  assert.throws(
    () => buildModelPricingSnapshot(invalidTier),
    /google\.models\.gemini-test\.cost\.tiers\[\]\.tier\.size/
  );
});

test('跨 provider 的重复模型 ID 被拒绝', () => {
  const payload = buildValidPayload();
  payload.xai.models['gpt-test'] = payload.xai.models['grok-test'];
  delete payload.xai.models['grok-test'];

  assert.throws(
    () => buildModelPricingSnapshot(payload),
    /Duplicate model ID "gpt-test" in openai and xai/
  );
});
