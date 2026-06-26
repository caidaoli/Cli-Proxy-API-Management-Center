import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const monitorPageSource = readFileSync(
  new URL('../src/pages/MonitorPage.tsx', import.meta.url),
  'utf8'
);
const monitorStylesSource = readFileSync(
  new URL('../src/pages/MonitorPage.module.scss', import.meta.url),
  'utf8'
);

test('监控中心渠道统计和失败来源分析使用 Tab 切换且默认显示渠道统计', () => {
  assert.match(monitorPageSource, /useState<StatsTab>\('channel'\)/);
  assert.match(monitorPageSource, /role="tablist"/);
  assert.match(monitorPageSource, /role="tab"/);
  assert.match(monitorPageSource, /activeStatsTab === 'channel'/);
  assert.match(monitorPageSource, /activeStatsTab === 'failure'/);
  assert.doesNotMatch(monitorPageSource, /styles\.statsGrid/);
});

test('监控中心统计 Tab 样式替代左右网格布局', () => {
  assert.match(monitorStylesSource, /\.statsTabs/);
  assert.match(monitorStylesSource, /\.statsTabButton/);
  assert.doesNotMatch(monitorStylesSource, /\.statsGrid/);
});
