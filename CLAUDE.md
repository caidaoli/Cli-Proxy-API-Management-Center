# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

CLI Proxy API 管理中心 (CPAMC) - 基于官方仓库二次开发的 Web 管理界面。核心本地差异包括**监控中心**、认证文件管理增强，以及发布时自动刷新的模型定价数据。

Usage 页面已删除，`/usage` 仅重定向到 `/monitor`。提供商页和认证文件页通过 `monitorApi.getKeyStats()` 获取统计数据；`src/utils/usage.ts` 只保留统计数据转换工具。项目中不存在独立的 `usageApi` 或 Usage Store。

## 常用命令

```bash
# 开发
npm run dev          # 启动开发服务器
npm run preview      # 预览构建产物

# 构建（TypeScript 类型检查 + Vite 构建）
npm run build

# 代码质量
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化
npm run type-check   # TypeScript 类型检查

# 从 models.dev 刷新生成的模型定价数据（需要网络）
npm run pricing:update
```

## 技术栈

- **框架**: React 19 + TypeScript 5.9
- **构建**: Vite 7 + vite-plugin-singlefile（单文件部署）
- **状态**: Zustand（轻量级状态管理）
- **路由**: React Router DOM 7
- **图表**: Chart.js + react-chartjs-2
- **样式**: SCSS Modules + CSS 变量主题系统
- **国际化**: i18next

## 核心架构

### 目录结构

```
src/
├── components/          # UI 组件
│   ├── monitor/         # 【核心】监控中心组件（含服务健康卡片）
│   ├── providers/       # AI 提供商配置
│   ├── quota/           # 配额管理
│   └── ui/              # 通用 UI 组件
├── features/            # 按业务领域组织的功能模块（认证文件、插件等）
├── pages/               # 路由页面
├── router/              # 路由定义和本地路由桥接
├── stores/              # Zustand 状态管理
├── services/api/        # API 服务层（Axios 封装）
├── hooks/               # 自定义 Hooks
├── data/                # 生成的数据文件（禁止手工修改）
├── i18n/locales/        # 国际化翻译文件
├── styles/              # 全局样式和变量
└── utils/               # 纯工具和数据转换逻辑
```

### 关键模式

1. **API 客户端**: `src/services/api/client.ts` 是单例 Axios 封装，自动处理认证头、错误拦截和版本检测
2. **监控统计**: 监控页、提供商页和认证文件页统一通过 `src/services/api/monitor.ts` 获取数据，转换逻辑位于 `src/utils/monitor.ts` 和 `src/utils/usage.ts`
3. **状态管理**: 各 Store 位于 `src/stores/`，使用 Zustand 的 `create()` 模式
4. **本地路由**: Monitor、OAuth 和 Usage 重定向定义在 `src/router/localRoutes.tsx`，由 `MainRoutes.tsx` 展开
5. **路径别名**: `@/` 映射到 `src/`，在 `vite.config.ts` 和 `tsconfig.json` 中配置
6. **SCSS 变量**: 全局变量通过 `@/styles/variables.scss` 自动注入
7. **模型定价**: `scripts/update-model-pricing.mjs` 从 models.dev 生成 `src/data/modelPricing.generated.ts`；生成文件禁止手工修改

### 构建特点

- 目标平台: ES2020
- 单文件输出: 所有资源内联，便于直接部署
- CSS 不分割: `cssCodeSplit: false`
- JS 不分块: `rolldownOptions.output.codeSplitting: false`

### 统计基础设施

Usage 页面、`usageApi` 和 Usage Store 均已删除。当前统计链路为：

- `src/services/api/monitor.ts` — 监控 Dashboard、KeyStats、请求明细等 API
- `src/components/providers/hooks/useProviderStats.ts` — 提供商统计，调用 `monitorApi.getKeyStats()`
- `src/features/authFiles/hooks/useAuthFilesStats.ts` — 当前认证文件页统计，按可见认证文件请求 KeyStats
- `src/utils/usage.ts` — KeyStats 和状态条数据转换工具，不负责网络请求

## 监控中心组件

位于 `src/components/monitor/`，是本项目相对于官方版本的核心差异：

- `KpiCards.tsx` - KPI 指标卡片
- `ServiceHealthCard.tsx` - 服务健康热力图（v1.15.0 从 Usage 页迁入）
- `ModelDistributionChart.tsx` - 模型用量分布饼图
- `DailyTrendChart.tsx` - 每日趋势分析
- `HourlyModelChart.tsx` / `HourlyTokenChart.tsx` - 小时级分析
- `ChannelStats.tsx` - 渠道统计
- `FailureAnalysis.tsx` - 失败来源分析
- `RequestLogs.tsx` - 请求日志（支持虚拟滚动，10万+数据）
- `requestLogColumns.ts` - 请求日志列定义和持久化
- `TimeRangeSelector.tsx` - 时间范围选择器
- `DisableModelModal.tsx` / `UnsupportedDisableModal.tsx` - 模型禁用弹窗
- `index.ts` - barrel 导出

## 模型定价和发布

- `npm run pricing:update` 从 `https://models.dev/api.json` 生成 Gemini、OpenAI、Claude 和 xAI 的定价快照
- `src/data/modelPricing.generated.ts` 是生成产物，必须通过脚本更新，禁止手工编辑
- `src/utils/costCalculator.ts` 消费生成的定价数据计算监控成本
- `.github/workflows/release.yml` 在 Tag 构建前刷新定价，再构建 `management.html`、SHA256 和 `panel-manifest.json`
- 修改生成器时复用 `tests/modelPricingGenerator.test.mjs`，测试规范化、错误处理和生成契约，不测试源码文本

## 上游同步

本项目 Fork 自官方仓库，需定期同步上游更新。

### Remote 配置

| Remote | 仓库 | 用途 |
|--------|------|------|
| `origin` | `caidaoli/Cli-Proxy-API-Management-Center` | 本 fork |
| `original-upstream` | `router-for-me/Cli-Proxy-API-Management-Center` | 唯一上游来源（**不含**监控中心） |

> 历史上的 `upstream`（kongkongyo/Cli-Proxy-API-Management-Center）已停产，不再作为同步来源。

### 合并策略

- **禁止直接 merge `original-upstream`**：该仓库不含监控中心，全量合并会删除本 fork 核心功能。
- 只能用 `git cherry-pick` 逐提交摘取，详见仓库级 `cherry-pick-upstream` skill：Claude 从 `.claude/skills/cherry-pick-upstream/` 加载，Codex 从 `.agents/skills/cherry-pick-upstream` symlink 加载，二者必须指向同一物理目录。

### 同步保护分类

不要把“本地专属文件”和“上游共享文件中的本地定制”混为一谈。前者通常保留整个文件；后者必须按行为逐段合并，禁止无脑使用 `ours` 或 `theirs`。

#### 本地专属文件

以下文件/目录在当前上游不存在，cherry-pick 时必须保留：

**监控中心（核心功能）：**

- `src/components/monitor/` — 全部监控组件和 `requestLogColumns.ts`
- `src/pages/MonitorPage.tsx` + `MonitorPage.module.scss` — 监控页面
- `src/services/api/monitor.ts` — 监控中心 API 服务
- `src/utils/monitor.ts` — 监控数据处理工具函数
- `src/hooks/useDisableModel.ts` — 模型禁用 Hook
- `src/stores/useDisabledModelsStore.ts` — 禁用模型状态管理

**隔离集成文件（本地代码与上游共享文件的桥接层）：**

- `src/router/localRoutes.tsx` — 本地路由（Monitor、OAuth、Usage 重定向），通过 `...localRoutes` 展开到 `MainRoutes.tsx`
- `src/services/api/local.ts` — 只导出 `monitor`，通过 `export * from './local'` 接入 `index.ts`
- `src/stores/local.ts` — 只导出 `useDisabledModelsStore`，通过 `export * from './local'` 接入 `index.ts`
- `src/i18n/locales/zh-CN-local.json` / `en-local.json` / `ru-local.json` — 本地翻译（monitor 命名空间），在 `i18n/index.ts` 中通过展开运算符合并

**模型定价流水线：**

- `scripts/update-model-pricing.mjs` — 定价生成器
- `src/data/modelPricing.generated.ts` — 生成的定价快照
- `tests/modelPricingGenerator.test.mjs` — 生成器契约测试

#### 上游共享文件中的本地定制

以下路径在上游也存在，不能声称为“本地独有”，但冲突处理时必须保留本地语义：

- `src/pages/OAuthPage.tsx` + `OAuthPage.module.scss` — OAuth 页面本地修改
- `src/pages/AuthFilesPage.tsx`、`src/features/authFiles/`、`src/services/api/authFiles.ts`、`src/services/api/authFilesUpload.ts` — 凭证清理、批量上传、分页、批量字段编辑、官方 API 等认证文件增强
- `src/pages/AuthFilesPage.tsx` 中的 `handleCodexCleanup`，以及 `src/services/api/authFiles.ts` 中的 `codexCleanup` 和 `CodexCleanupEvent`
- `src/router/MainRoutes.tsx` — 必须保留 `...localRoutes`
- `src/services/api/index.ts` / `src/stores/index.ts` — 必须保留 `export * from './local'`
- `src/i18n/index.ts` — 必须保留本地翻译合并
- `src/i18n/locales/zh-CN.json`、`en.json` 中的 `nav.monitor`；`zh-CN.json`、`en.json`、`ru.json` 中的 `auth_files.codex_cleanup_*`
- `package.json`、`src/utils/costCalculator.ts`、`.github/workflows/release.yml` — 必须保留模型定价生成和发布集成
- `src/services/api/client.ts` — 可能包含版本检测等本地增强
- `src/components/ui/icons.tsx` — 可能包含监控中心使用的图标

**上游同步安全网：**

- `.gitattributes` 为部分受保护路径设置 `merge=ours`，它只是冲突处理辅助，不替代 cherry-pick 后的 diff、构建和行为检查
