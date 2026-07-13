# 四家模型价格同步设计

## 根因

当前发布流程只执行 `scripts/update-openai-pricing.mjs`。该脚本把
`models.dev` 的 provider key、输出文件名和导出名全部写死为 OpenAI，导致：

- OpenAI 会在发布构建前刷新；
- Claude 和 Gemini 仍依赖 `costCalculator.ts` 中的手写价格；
- xAI/Grok 没有价格表，费用始终无法计算。

根因是价格生成边界被错误建模成“OpenAI 专用脚本”，而不是“从同一数据源同步受支持供应商”。

## 目标

每次 `v*` Tag 触发发布 Action 时，在构建前从
`https://models.dev/api.json` 同步以下 canonical provider：

| 产品 | models.dev provider key |
| --- | --- |
| Gemini | `google` |
| OpenAI | `openai` |
| Claude | `anthropic` |
| xAI/Grok | `xai` |

四家必须作为一个价格快照整体更新。任一家缺失、没有有效定价或数据结构非法时，发布立即失败，禁止生成部分更新的快照。

## 非目标

- 不合并 `google-vertex`、`google-vertex-anthropic`、Azure 等云厂商镜像价格。
- 不在浏览器运行时请求价格。
- 不增加重试、缓存或旧快照静默回退。
- 不改变 Release 的 Tag 触发条件，也不让 Action 回写 Git 历史。
- 不处理音频、图像等当前费用计算器没有 token 输入的数据维度。

## 生成器设计

用 `scripts/update-model-pricing.mjs` 替换 OpenAI 专用脚本。生成器只请求一次数据，并通过一个声明式 provider 配置表把 source key 映射为以下具名导出：

- `geminiModelPricing`
- `openAIModelPricing`
- `claudeModelPricing`
- `xAIModelPricing`

每个带 `cost` 的模型统一解析：

- `input`、`output`；
- 可选的 `cache_read`、`cache_write`；
- 可选的 context tier 阈值及其输入、输出、缓存价格。

所有 provider 会先在内存中完成读取、转换和校验。只有四家全部成功后，才按 provider 和模型 ID 确定性排序并一次写入
`src/data/modelPricing.generated.ts`。不同 provider 出现相同模型 ID 时视为价格归属冲突，生成失败，不允许对象展开时静默覆盖。

生成器提供可导入的纯转换入口，返回四个结构化价格表；序列化器再把该结果写成 TypeScript 模块。命令行入口只负责 fetch、调用转换/序列化和写文件。这样测试可以解析并断言数据结构，不需要检查源码文本或私有 helper。

## 应用集成

`src/utils/costCalculator.ts` 从统一生成文件导入四个价格表，并合并成现有解析器使用的索引。模糊前缀列表从合并后的模型 key 自动生成，因此新加入的 Claude、Gemini、OpenAI 和 Grok 模型无需再手工登记。

当前手写的 Claude/Gemini 活跃模型价格从 `costCalculator.ts` 删除，生成快照成为四家当前模型的唯一价格源。迁移时，现有硬编码表中没有出现在 canonical provider 快照里的旧模型会保留在一个明确命名的静态历史 fallback 中；合并顺序保证生成价格始终覆盖 fallback，当前模型不会存在两个有效来源。

已有模型别名继续承担命名归一化；仅在观测到的模型名与 canonical ID 不一致时补充显式别名，例如把非 preview 的 Gemini 名称映射到对应 preview 计价模型。xAI/Grok 模型使用生成表中的精确 ID 和自动前缀匹配，不新增供应商特判。

## Action 和命令

`package.json` 删除 `pricing:update:openai`，新增：

```json
"pricing:update": "node scripts/update-model-pricing.mjs"
```

`.github/workflows/release.yml` 在 `npm ci` 后、`npm run build` 前执行：

```yaml
- name: Update model pricing
  run: npm run pricing:update
```

Action runner 中生成的新快照只参与当次 `management.html` 构建，不提交生成文件、不改写 Tag。仓库继续提交一份生成快照，供离线开发和普通构建使用。

## 失败处理

以下情况都返回非零退出码并中止发布：

- HTTP 请求失败；
- 响应不是预期对象；
- 任一必需 provider 或其 `models` 缺失；
- 任一 provider 没有带有效价格的模型；
- 必需价格不是有限的非负数；
- context tier 存在但阈值或阶梯价格非法；
- 四家之间出现重复模型 ID；
- 生成文件写入失败。

错误信息包含 provider、模型 ID 和字段路径，避免只得到笼统的“更新失败”。成功日志分别输出四家的模型数量和目标文件。

## 测试与验证

仓库目前没有适合复用的生成器测试文件，因此新增一个 Node 内置 `node:test` 文件，不引入测试框架。测试覆盖公开转换入口的有意义契约：

- 四个 canonical provider 都生成对应具名价格表；
- cache read、cache write 和 context tier 被正确归一化；
- provider 缺失、空价格集合和非法字段使整个转换失败；
- 重复模型 ID 使转换失败。

不测试脚本源码、helper 调用、输出代码的空格或引号风格。实现完成后依次运行价格生成器、生成器测试、类型检查、lint 和完整构建，并确认生成器连续运行两次不会产生 diff。

## 文件变更

- 删除 `scripts/update-openai-pricing.mjs`。
- 新增 `scripts/update-model-pricing.mjs` 及其 Node 测试。
- 删除 `src/data/openaiPricing.generated.ts`。
- 新增 `src/data/modelPricing.generated.ts`。
- 修改 `src/utils/costCalculator.ts`、`package.json` 和 `.github/workflows/release.yml`。
