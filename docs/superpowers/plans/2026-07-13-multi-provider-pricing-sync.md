# 四家模型价格同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每次 Tag 发布 Action 在构建前原子同步 Gemini、OpenAI、Claude 和 xAI/Grok 的 canonical 模型价格，并让监控费用计算消费同一份生成快照。

**Architecture:** 用一个可测试的 Node ESM 生成器完成一次 fetch、四家转换、整体校验和确定性序列化，输出四个具名价格表。费用计算器合并生成表与只覆盖退役模型的历史 fallback，Action 只执行一个统一更新命令，任何一家失败都会阻止发布。

**Tech Stack:** Node.js 24、Node `node:test`、TypeScript 5.9、npm、GitHub Actions YAML、models.dev JSON API

## Global Constraints

- 只读取 `google`、`openai`、`anthropic`、`xai`，不混入 Vertex、Azure 或其他云厂商镜像。
- 四家作为一个快照处理；任一家缺失、无有效价格或字段非法时整体失败。
- 浏览器运行时不得请求价格；Release Action 不回写 Git、不改写 Tag。
- 不引入新依赖，不处理当前费用计算器没有 token 输入的音频/图像价格维度。
- 生成价格覆盖历史 fallback；当前模型不得存在两个有效价格源。
- 遵循项目测试策略：测试转换、错误处理、费用计算等公开行为，不测试源码文本、私有 helper 或 YAML 样式。

---

## File Structure

- `scripts/update-model-pricing.mjs`：唯一的 models.dev 转换、校验、序列化和 CLI I/O 入口。
- `tests/modelPricingGenerator.test.mjs`：生成器公开数据契约测试；现有测试中没有文件承担该边界，因此新增文件。
- `src/data/modelPricing.generated.ts`：四家确定性生成快照和共享 `ModelPricing` 类型。
- `src/utils/costCalculator.ts`：价格合并、历史 fallback、别名解析和公开费用计算。
- `tests/monitorKpiContract.test.ts`：复用现有监控费用契约测试，证明四家生成价格实际参与计算。
- `package.json`：统一的 `pricing:update` 命令。
- `.github/workflows/release.yml`：发布构建前调用统一价格更新命令。

### Task 1: 建立四家原子价格生成器

**Files:**
- Create: `scripts/update-model-pricing.mjs`
- Create: `tests/modelPricingGenerator.test.mjs`
- Create: `src/data/modelPricing.generated.ts`（由命令生成）
- Delete: `scripts/update-openai-pricing.mjs`
- Modify: `package.json:6-14`
- Keep temporarily: `src/data/openaiPricing.generated.ts`（Task 2 切换消费者后删除）

**Interfaces:**
- Consumes: `https://models.dev/api.json`，结构为 `{ [providerKey]: { models: { [modelId]: { cost } } } }`。
- Produces: `buildModelPricingSnapshot(payload)`、`serializeModelPricingSnapshot(snapshot)`。
- Produces: `modelPricing.generated.ts` 中的 `ModelPricing`、`geminiModelPricing`、`openAIModelPricing`、`claudeModelPricing`、`xAIModelPricing`。

- [ ] **Step 1: 先写生成器公开契约测试**

新增 `tests/modelPricingGenerator.test.mjs`：

```js
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
```

- [ ] **Step 2: 运行测试，确认因新模块不存在而失败**

Run:

```bash
node --test tests/modelPricingGenerator.test.mjs
```

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND` 和 `scripts/update-model-pricing.mjs`。

- [ ] **Step 3: 实现通用转换器、序列化器和 CLI**

创建 `scripts/update-model-pricing.mjs`：

```js
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://models.dev/api.json';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'src/data/modelPricing.generated.ts');

const PROVIDERS = [
  { productName: 'Gemini', sourceKey: 'google', exportName: 'geminiModelPricing' },
  { productName: 'OpenAI', sourceKey: 'openai', exportName: 'openAIModelPricing' },
  { productName: 'Claude', sourceKey: 'anthropic', exportName: 'claudeModelPricing' },
  { productName: 'xAI', sourceKey: 'xai', exportName: 'xAIModelPricing' },
];

const OPTIONAL_PRICES = [
  ['cache_read', 'cacheReadPrice'],
  ['cache_write', 'cacheWritePrice'],
];

const TIER_PRICES = [
  ['input', 'inputPriceHigh'],
  ['output', 'outputPriceHigh'],
  ['cache_read', 'cacheReadPriceHigh'],
  ['cache_write', 'cacheWritePriceHigh'],
];

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readPrice = (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid price at ${path}`);
  }
  return value;
};

const normalizePricing = (cost, path) => {
  if (!isRecord(cost)) {
    throw new Error(`Invalid cost object at ${path}`);
  }

  const pricing = {
    inputPrice: readPrice(cost.input, `${path}.input`),
    outputPrice: readPrice(cost.output, `${path}.output`),
  };

  for (const [sourceField, targetField] of OPTIONAL_PRICES) {
    if (cost[sourceField] !== undefined) {
      pricing[targetField] = readPrice(cost[sourceField], `${path}.${sourceField}`);
    }
  }

  if (cost.tiers !== undefined && !Array.isArray(cost.tiers)) {
    throw new Error(`Invalid context tiers at ${path}.tiers`);
  }

  const contextTiers = (cost.tiers ?? []).filter(
    (candidate) => isRecord(candidate) && isRecord(candidate.tier) && candidate.tier.type === 'context'
  );
  if (contextTiers.length > 1) {
    throw new Error(`Multiple context tiers at ${path}.tiers`);
  }

  const [tier] = contextTiers;
  if (tier) {
    pricing.tierThreshold = readPrice(tier.tier.size, `${path}.tiers[].tier.size`);
    for (const [sourceField, targetField] of TIER_PRICES) {
      if (sourceField === 'input' || sourceField === 'output' || tier[sourceField] !== undefined) {
        pricing[targetField] = readPrice(tier[sourceField], `${path}.tiers[].${sourceField}`);
      }
    }
  }

  return pricing;
};

export function buildModelPricingSnapshot(payload) {
  if (!isRecord(payload)) {
    throw new Error('models.dev response must be an object');
  }

  const snapshot = {};
  const modelOwners = new Map();

  for (const { sourceKey, exportName } of PROVIDERS) {
    const provider = payload[sourceKey];
    const models = isRecord(provider) ? provider.models : undefined;
    if (!isRecord(models)) {
      throw new Error(`models.dev response is missing ${sourceKey}.models`);
    }

    const entries = Object.entries(models)
      .filter(([, model]) => isRecord(model) && model.cost !== undefined && model.cost !== null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([modelId, model]) => [
        modelId,
        normalizePricing(model.cost, `${sourceKey}.models.${modelId}.cost`),
      ]);

    if (entries.length === 0) {
      throw new Error(`models.dev returned no priced models for ${sourceKey}`);
    }

    for (const [modelId] of entries) {
      const previousOwner = modelOwners.get(modelId);
      if (previousOwner) {
        throw new Error(`Duplicate model ID "${modelId}" in ${previousOwner} and ${sourceKey}`);
      }
      modelOwners.set(modelId, sourceKey);
    }

    snapshot[exportName] = Object.fromEntries(entries);
  }

  return snapshot;
}

export function serializeModelPricingSnapshot(snapshot) {
  const lines = [
    '// Generated by scripts/update-model-pricing.mjs from https://models.dev/api.json.',
    '// Do not edit manually.',
    '',
    'export interface ModelPricing {',
    '  inputPrice: number;',
    '  outputPrice: number;',
    '  cacheReadPrice?: number;',
    '  cacheWritePrice?: number;',
    '  tierThreshold?: number;',
    '  inputPriceHigh?: number;',
    '  outputPriceHigh?: number;',
    '  cacheReadPriceHigh?: number;',
    '  cacheWritePriceHigh?: number;',
    '}',
    '',
  ];

  for (const { exportName } of PROVIDERS) {
    const table = snapshot[exportName];
    if (!isRecord(table)) {
      throw new Error(`Pricing snapshot is missing ${exportName}`);
    }

    lines.push(`export const ${exportName} = {`);
    for (const [modelId, pricing] of Object.entries(table).sort(([left], [right]) =>
      left.localeCompare(right)
    )) {
      lines.push(`  ${JSON.stringify(modelId)}: ${JSON.stringify(pricing)},`);
    }
    lines.push('} satisfies Record<string, ModelPricing>;', '');
  }

  return lines.join('\n');
}

async function updateModelPricing() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status} ${response.statusText}`);
  }

  const snapshot = buildModelPricingSnapshot(await response.json());
  const source = serializeModelPricingSnapshot(snapshot);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, source, 'utf8');

  const counts = PROVIDERS.map(
    ({ productName, exportName }) => `${productName}: ${Object.keys(snapshot[exportName]).length}`
  ).join(', ');
  process.stdout.write(`Generated model prices (${counts}) at ${outputPath}\n`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  await updateModelPricing();
}
```

- [ ] **Step 4: 运行生成器测试，确认转换和失败契约通过**

Run:

```bash
node --test tests/modelPricingGenerator.test.mjs
```

Expected: 5 tests PASS，0 FAIL。

- [ ] **Step 5: 切换 npm 命令并生成四家快照**

将 `package.json` 中的旧命令替换为：

```json
"pricing:update": "node scripts/update-model-pricing.mjs"
```

删除 `scripts/update-openai-pricing.mjs`，然后运行：

```bash
npm run pricing:update
```

Expected: 输出 Gemini、OpenAI、Claude、xAI 四个非零模型数量，并创建 `src/data/modelPricing.generated.ts`。此时暂不删除旧 OpenAI 快照，保证 Task 1 单独完成后现有应用仍可编译。

- [ ] **Step 6: 验证 Task 1 的独立交付物**

Run:

```bash
node --test tests/modelPricingGenerator.test.mjs
npm run type-check
git diff --check
```

Expected: 生成器测试全部 PASS；TypeScript 无错误；`git diff --check` 无输出。

- [ ] **Step 7: 提交通用生成器**

```bash
git add package.json scripts/update-model-pricing.mjs scripts/update-openai-pricing.mjs \
  tests/modelPricingGenerator.test.mjs src/data/modelPricing.generated.ts
git commit -m "feat: sync pricing for all supported providers"
```

### Task 2: 让费用计算器消费四家生成价格

**Files:**
- Modify: `tests/monitorKpiContract.test.ts:1-100`
- Modify: `src/utils/costCalculator.ts:1-269`
- Delete: `src/data/openaiPricing.generated.ts`

**Interfaces:**
- Consumes: Task 1 生成的四个 `Record<string, ModelPricing>`。
- Produces: 现有公开 API `calculateModelCost(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, options)`；签名不变。
- Preserves: canonical 快照中不存在的 Claude 3、Claude 4.0、Gemini 1.5 历史费用。

- [ ] **Step 1: 扩展现有监控费用契约测试**

在 `tests/monitorKpiContract.test.ts` 的 imports 中加入：

```ts
import {
  claudeModelPricing,
  geminiModelPricing,
  openAIModelPricing,
  xAIModelPricing,
  type ModelPricing,
} from '../src/data/modelPricing.generated.ts';
```

将现有 Claude 长上下文断言的期望值从手写阶梯价更新为 canonical Anthropic 快照价格：

```ts
assert.equal(
  calculateMonitorRequestCost('claude-sonnet-4-5-20250929', 2_000_000, 1_000_000, 1_000_000),
  18.3
);
```

在现有 `models.dev OpenAI 快照包含...` 测试后加入：

```ts
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
```

- [ ] **Step 2: 运行现有测试，确认新费用契约失败**

Run:

```bash
node --test tests/monitorKpiContract.test.ts
```

Expected: FAIL；至少包含 xAI/Grok 当前返回 `0`，以及 Claude 仍返回旧手写阶梯价的断言失败。

- [ ] **Step 3: 用生成表替换当前模型硬编码**

将 `src/utils/costCalculator.ts` 顶部替换为：

```ts
import {
  claudeModelPricing,
  geminiModelPricing,
  openAIModelPricing,
  xAIModelPricing,
  type ModelPricing,
} from '../data/modelPricing.generated.ts';

export type { ModelPricing } from '../data/modelPricing.generated.ts';

export interface CostCalculationOptions {
  applyLongContextTier?: boolean;
}

const TOKENS_PER_MILLION = 1_000_000;
const DEFAULT_CACHE_READ_MULTIPLIER = 0.1;
const DEFAULT_LONG_CONTEXT_THRESHOLD = 200_000;

const legacyModelPricing: Record<string, ModelPricing> = {
  'claude-sonnet-4-0': {
    inputPrice: 3,
    outputPrice: 15,
    inputPriceHigh: 6,
    outputPriceHigh: 22.5,
  },
  'claude-opus-4-0': { inputPrice: 15, outputPrice: 75 },
  'claude-3-7-sonnet': { inputPrice: 3, outputPrice: 15 },
  'claude-3-5-sonnet': { inputPrice: 3, outputPrice: 15 },
  'claude-3-5-haiku': { inputPrice: 0.8, outputPrice: 4 },
  'claude-3-opus': { inputPrice: 15, outputPrice: 75 },
  'claude-3-sonnet': { inputPrice: 3, outputPrice: 15 },
  'claude-3-haiku': { inputPrice: 0.25, outputPrice: 1.25 },
  'claude-opus': { inputPrice: 5, outputPrice: 25 },
  'claude-sonnet': { inputPrice: 3, outputPrice: 15 },
  'claude-haiku': { inputPrice: 1, outputPrice: 5 },
  'gemini-1.5-pro': { inputPrice: 1.25, outputPrice: 5 },
  'gemini-1.5-flash': { inputPrice: 0.2, outputPrice: 0.6 },
};

const modelPricing: Record<string, ModelPricing> = {
  ...legacyModelPricing,
  ...geminiModelPricing,
  ...openAIModelPricing,
  ...claudeModelPricing,
  ...xAIModelPricing,
};
```

保留现有 `modelAliases`，并加入以下 canonical 映射：

```ts
'gemini-3-5-flash': 'gemini-3.5-flash',
'gemini-3.1-pro': 'gemini-3.1-pro-preview',
'gemini-3-pro': 'gemini-3-pro-preview',
'gemini-3-flash': 'gemini-3-flash-preview',
```

将整个手写 `fuzzyPrefixes` 数组替换为：

```ts
const fuzzyPrefixes = Object.keys(modelPricing).sort(
  (left, right) => right.length - left.length
);
```

将默认常量引用改为通用名称：

```ts
input > (pricing.tierThreshold ?? DEFAULT_LONG_CONTEXT_THRESHOLD)
```

以及：

```ts
const cacheReadPrice =
  explicitCacheReadPrice ??
  (resolved.key.startsWith('gpt-')
    ? inputPrice * getOpenAICacheMultiplier(resolved.key)
    : inputPrice * DEFAULT_CACHE_READ_MULTIPLIER);
```

最后删除 `src/data/openaiPricing.generated.ts`；不保留旧 import 或 npm 命令别名。

- [ ] **Step 4: 运行费用契约和类型检查**

Run:

```bash
node --test tests/monitorKpiContract.test.ts
npm run type-check
git diff --check
```

Expected: `monitorKpiContract` 全部 PASS；TypeScript 无错误；无 whitespace error。

- [ ] **Step 5: 提交四家费用计算集成**

```bash
git add src/utils/costCalculator.ts src/data/openaiPricing.generated.ts \
  tests/monitorKpiContract.test.ts
git commit -m "feat(monitor): calculate costs from generated provider pricing"
```

### Task 3: 切换 Release Action 并完成全量验证

**Files:**
- Modify: `.github/workflows/release.yml:28-35`

**Interfaces:**
- Consumes: `npm run pricing:update`。
- Produces: 每次 `v*` Tag 构建前都会刷新四家价格；命令失败时后续 build/release 步骤不会执行。

- [ ] **Step 1: 更新发布步骤**

将 `.github/workflows/release.yml` 中旧步骤替换为：

```yaml
- name: Update model pricing
  run: npm run pricing:update
```

这是现有 Action 编排的两行替换，不新增源码/YAML 文本断言；通过实际执行同一 npm 命令和完整构建验证。

- [ ] **Step 2: 验证生成器确定性和四家实时数据**

Run:

```bash
npm run pricing:update
first_hash="$(shasum -a 256 src/data/modelPricing.generated.ts | cut -d ' ' -f 1)"
npm run pricing:update
second_hash="$(shasum -a 256 src/data/modelPricing.generated.ts | cut -d ' ' -f 1)"
test "$first_hash" = "$second_hash"
```

Expected: 两次均打印四个非零模型数量，hash 相同。

- [ ] **Step 3: 运行聚焦测试和完整工程验证**

Run:

```bash
node --test tests/modelPricingGenerator.test.mjs tests/monitorKpiContract.test.ts
npm run type-check
npm run lint
npm run build
git diff --check
```

Expected: 所有测试 PASS；type-check、lint、build 退出码均为 0；`dist/index.html` 成功生成；`git diff --check` 无输出。

- [ ] **Step 4: 审核最终变更范围**

Run:

```bash
git status --short
git diff --stat HEAD
git diff -- .github/workflows/release.yml package.json scripts/update-model-pricing.mjs \
  src/utils/costCalculator.ts tests/modelPricingGenerator.test.mjs \
  tests/monitorKpiContract.test.ts
```

Expected: 只包含本计划列出的价格生成、价格消费、测试和 Action 文件；不存在 `pricing:update:openai`、`update-openai-pricing.mjs` 或 `openaiPricing.generated.ts` 的残留引用。

- [ ] **Step 5: 提交 Action 切换和最终快照**

```bash
git add .github/workflows/release.yml src/data/modelPricing.generated.ts
git commit -m "ci: refresh all provider pricing before release"
```

- [ ] **Step 6: 记录最终证据**

Run:

```bash
git status --short
git log -5 --oneline
```

Expected: 工作区干净；最近提交依次包含设计文档、实施计划、通用生成器、费用集成和 Action 切换。
