import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const channelStatsSource = readFileSync(
  new URL('../src/components/monitor/ChannelStats.tsx', import.meta.url),
  'utf8'
);
const monitorStylesSource = readFileSync(
  new URL('../src/pages/MonitorPage.module.scss', import.meta.url),
  'utf8'
);
const monitorApiSource = readFileSync(
  new URL('../src/services/api/monitor.ts', import.meta.url),
  'utf8'
);

test('渠道统计主表和模型明细拆分 token 与缓存率列', () => {
  const expectedHeaders = [
    'monitor.logs.header_input',
    'monitor.logs.header_output',
    'monitor.logs.header_cache',
    'monitor.logs.header_cache_ratio',
  ];

  for (const header of expectedHeaders) {
    const escapedHeader = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const occurrences = channelStatsSource.match(new RegExp(`t\\('${escapedHeader}'\\)`, 'g')) ?? [];
    assert.equal(occurrences.length, 2, `${header} should appear in main and detail tables`);
  }

  assert.match(channelStatsSource, /formatCompactTokenNumber/);
  assert.match(channelStatsSource, /formatCacheTokenRatio/);
});

test('渠道统计数字列右对齐', () => {
  assert.match(channelStatsSource, /styles\.numberCell/);
  assert.match(channelStatsSource, /renderTokenCell/);
  assert.match(channelStatsSource, /renderCacheRatioCell/);
  assert.match(monitorStylesSource, /th\.numberCell,\s*\n\s*td\.numberCell\s*\{[\s\S]*text-align:\s*right/);
});

test('渠道统计缓存为 0 时缓存和缓存率显示为空白', () => {
  assert.match(channelStatsSource, /cachedTokens\s*>\s*0\s*\?\s*formatCompactTokenNumber\(cachedTokens\)\s*:\s*''/);
  assert.match(channelStatsSource, /cachedTokens\s*>\s*0\s*\?\s*cache\.ratio\s*:\s*''/);
});

test('渠道统计接口类型包含 token 聚合字段', () => {
  const channelStatsItem = monitorApiSource.match(
    /export interface MonitorChannelStatsItem \{[\s\S]*?\n\}/
  )?.[0] ?? '';
  const modelStatsItem = monitorApiSource.match(
    /export interface MonitorModelStatsItem \{[\s\S]*?\n\}/
  )?.[0] ?? '';

  for (const source of [channelStatsItem, modelStatsItem]) {
    assert.match(source, /input_tokens: number;/);
    assert.match(source, /output_tokens: number;/);
    assert.match(source, /cached_tokens: number;/);
  }
});
