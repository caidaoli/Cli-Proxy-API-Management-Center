# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

CLI Proxy API 管理中心 (CPAMC) - 基于官方仓库二次创作的 Web 管理界面，主要新增了**监控中心**功能模块。

> **v1.15.0 架构变更**: Usage 页面已移除，ServiceHealthCard 迁入监控中心。原 Usage 页的统计能力由提供商页和认证文件页直接消费 `usageApi`，不再有独立入口。

## 常用命令

```bash
# 开发
npm run dev          # 启动开发服务器

# 构建（TypeScript 类型检查 + Vite 构建）
npm run build

# 代码质量
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化
npm run type-check   # TypeScript 类型检查
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
├── stores/              # Zustand 状态管理
├── services/api/        # API 服务层（Axios 封装）
├── hooks/               # 自定义 Hooks
├── i18n/locales/        # 国际化翻译文件
└── styles/              # 全局样式和变量
```

### 关键模式

1. **API 客户端**: `src/services/api/client.ts` 是单例 Axios 封装，自动处理认证头、错误拦截、版本检测
2. **状态管理**: 各 Store 位于 `src/stores/`，使用 Zustand 的 `create()` 模式
3. **路径别名**: `@/` 映射到 `src/`，在 `vite.config.ts` 和 `tsconfig.json` 中配置
4. **SCSS 变量**: 全局变量自动注入，通过 `@/styles/variables.scss`

### 构建特点

- 目标平台: ES2015
- 单文件输出: 所有资源内联，便于直接部署
- CSS 不分割: `cssCodeSplit: false`
- 动态导入内联: `inlineDynamicImports: true`

### 保留的 Usage 基础设施

Usage 页面已删除，但以下文件仍保留，因为提供商页（`useProviderStats`）和认证文件页（`useAuthFilesStats`）直接依赖其统计接口：

- `src/services/api/usage.ts` — Usage API 服务（KeyStats、UsageDetail 等接口）
- `src/utils/usage.ts` — 统计数据处理工具函数

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
- `TimeRangeSelector.tsx` - 时间范围选择器
- `DisableModelModal.tsx` / `UnsupportedDisableModal.tsx` - 模型禁用弹窗
- `index.ts` - barrel 导出

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

### 本地独有文件（cherry-pick 时必须保留）

以下文件/目录为本 fork 独有，**不存在于上游**。cherry-pick 时如果上游提交试图删除这些文件，必须保留本地版本：

**监控中心（核心功能）：**
- `src/components/monitor/` — 全部组件（KpiCards、ServiceHealthCard、ChannelStats、DailyTrendChart、FailureAnalysis、HourlyModelChart、HourlyTokenChart、ModelDistributionChart、RequestLogs、TimeRangeSelector、DisableModelModal、UnsupportedDisableModal）
- `src/pages/MonitorPage.tsx` + `MonitorPage.module.scss` — 监控页面
- `src/services/api/monitor.ts` — 监控中心 API 服务
- `src/utils/monitor.ts` — 监控数据处理工具函数
- `src/hooks/useDisableModel.ts` — 模型禁用 Hook
- `src/stores/useDisabledModelsStore.ts` — 禁用模型状态管理

**OAuth 页面：**
- `src/pages/OAuthPage.tsx` + `OAuthPage.module.scss`

**Codex 凭证清理功能：**
- `src/pages/AuthFilesPage.tsx` 中的 `handleCodexCleanup` 相关代码
- `src/services/api/authFiles.ts` 中的 `codexCleanup` 方法和 `CodexCleanupEvent` 类型

**隔离集成文件（本地代码与上游共享文件的桥接层）：**
- `src/router/localRoutes.tsx` — 本地路由（Monitor、OAuth、Usage 重定向），通过 `...localRoutes` 展开到 `MainRoutes.tsx`
- `src/services/api/local.ts` — 本地 API barrel 导出（monitor、usage），通过 `export * from './local'` 接入 `index.ts`
- `src/stores/local.ts` — 本地 Store barrel 导出（useDisabledModelsStore、useUsageStatsStore），通过 `export * from './local'` 接入 `index.ts`
- `src/i18n/locales/zh-CN-local.json` / `en-local.json` / `ru-local.json` — 本地翻译（monitor 命名空间），在 `i18n/index.ts` 中通过展开运算符合并

**路由注册：**
- `src/router/MainRoutes.tsx` 中通过 `...localRoutes` 引入本地路由

**国际化键值：**
- `src/i18n/locales/*-local.json` 中的 `monitor` 顶层键
- `src/i18n/locales/zh-CN.json`、`en.json`、`ru.json` 中 `nav.monitor` 和 `auth_files.codex_cleanup_*` 相关键值（少量，留在主文件中）

**其他本地修改：**
- `src/services/api/client.ts` — 可能包含本地增强（版本检测等）
- `src/components/ui/icons.tsx` — 可能包含监控中心用到的图标

**上游同步安全网：**
- `.gitattributes` — 为纯本地文件设置 `merge=ours`，防止 cherry-pick 时上游意外删除
