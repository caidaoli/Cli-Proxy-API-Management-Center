#!/usr/bin/env bash
# cherry-pick-batch.sh — 批量 cherry-pick 上游提交，自动跳过 merge=ours 吸收掉的空提交，遇到真冲突即停。
#
# 用法：
#   bash .claude/skills/cherry-pick-upstream/cherry-pick-batch.sh [hash-list-file]
#
# 默认 hash-list-file = /tmp/unpicked.txt，每行一个完整 commit hash + 任意后续描述。
# 跳过列表写在脚本内 SKIP_HASHES 数组，按前缀匹配（7 位短 hash 即可）。
#
# 退出码：
#   0  全部处理完毕
#   1  脚本/git 错误
#   2  遇到冲突，需人工处理（git status / git diff 查看，解决后 `git cherry-pick --continue`，再重跑本脚本）

set -euo pipefail

HASH_FILE="${1:-/tmp/unpicked.txt}"

if [[ ! -f "$HASH_FILE" ]]; then
  echo "ERROR: hash list file not found: $HASH_FILE" >&2
  echo "Generate it with: git cherry -v main original-upstream/main | awk '\$1==\"+\" {\$1=\"\"; print substr(\$0,2)}' > /tmp/unpicked.txt" >&2
  exit 1
fi

# 用户决定跳过的 commit（短 hash 前缀匹配即可）
SKIP_HASHES=(
  ed1a288   # feat(gemini-cli): ALL project id — OAuthPage merge=ours 拦截，i18n 键已被 df693be 删除，净效果仅 package-lock 噪声
  c75aeec   # fix(export): harden downloads — 本地已用 downloadBlob，usage 文件已删，净空
  243eaf2   # fix(usage): propagate loadUsageStats errors — 本地等价已存，usage 页面已删
  b4358e3   # feat(theme): pure-white theme
  bf8dafc   # feat(styles): theme color sync
  57a3063   # chore: switch to bun
  ef7b63e   # update package.json (deps overhaul, aborted before)
  c9e0c5d   # refactor(usage): centralize normalizeAuthIndex — 净空，本地 Kimi/xAI 早已 newer
  095f13b   # refactor(types): extract source info types — 本地已在 useTraceResolver hook 中应用
  c25e755   # refactor(source): extract buildSourceInfoMap — 本地 sourceResolver 已是上游超集
  b363edc   # refactor(source): extract resolveSourceDisplay — 同上
  b492bfa   # refactor(logs): extract useLogFilters — 本地 hook 已含 useLocalStorage 持久化
  3167c07   # refactor(logs): extract useTraceResolver — 本地 hook 已存在并更完整
  e1b34e0   # fix(quota): decouple quota-page idle hint — 本地已应用 cardIdleMessageKey 并扩展为可点击刷新
  3feb9c3   # feat(ui): floating action — 本地已有完整 floatingAction & monitor 化的 trace；isCurrentLayer 字段改名差异
  1953206   # fix(usage): stabilize dashboard metrics — 本地已删 Usage 页，所有变更落在已删文件
  95798f6   # Remove health status pill from auth file cards — 本地已删 health pill 并添加更多功能
  bdda9be   # refactor(logs): replace score-based trace matching — 本地 useTraceResolver 走 monitorApi 路径
  dc941f6   # feat(quota): add Kimi quota management — 本地 Kimi 已通过早前批次完整集成
  5ccf1da   # fix(config-editor): preserve source YAML edits — 本地已应用更彻底的 visual mode 保护
  37da584   # refactor(animation): replace GSAP with motion mini — 本地早已用 motion 并预计算 layer values
  ee784b5   # fix(config): normalize visual yaml diff — 本地已有 normalizeYamlForVisualDiff & 卡片式 DiffModal 重构
  3308307   # fix(config): block visual mode on invalid yaml — 本地已有 visualParseError 拦截
  091c6f7   # fix(config): apply visual saves to latest yaml — 本地 97839c0 (preserve source draft) 已是更新版
  8796a5f   # fix(ui): editor accessibility — 本地 Select 已 portal/viewport tracking、VisualConfigEditor 已重构
  a84869e   # fix(auth-files): show Claude quota — 本地 QuotaSection 已含 claude 分支
  38d7e20   # feat(ai-providers): ampcode multi-upstream + vertex excluded — 本地已通过 4cb222f/早期 cherry-pick 集成
  cb8208e   # feat(auth-files): enhance error handling — 本地已有 AUTH_FILE_INVALID_JSON_OBJECT_ERROR & CodexCleanupEvent
  136ab2a   # feat(auth-files): problem filter — 本地已有 problemOnly 过滤集成
  beeecf7   # fix(types): restore missing deps — 本地 DiffModal 已抽出 diffModalUtils
  df96297   # feat(ai-providers): Vertex AI toggle — 本地 VertexSection 已有 ToggleSwitch
  a354787   # style(sidebar): redesign sidebar icons — 本地有 IconActivity 等替代设计，与上游差异化
  6d91cd0   # fix(quota): gemini cli code assist — 本地已完整应用并扩展 tierId/xai 支持
  babb9b0   # refactor(system-page): aboutActions — 本地保留 fork+upstream 双链接
  aa34487   # refactor(system-page): version check — 已应用为 a91be62，保留本地 MainLayout monitorApi/versionApi 导入
  c540063   # feat(authFiles): sorting + UI — 本地已有 IconSearch、websockets、headersText 等更先进特性
  faf1e3f   # feat(auth-files): merge details into editor — 已应用为 a9dd06d，本地保留 invalidContentPreview/headersText/xai 等扩展
  975d047   # feat(auth-files): revamp filters + card layout — 本地已有 IconSearch+filterSearchItem，SCSS 重构破坏性大，保留本地 UI
  e44a9fc   # feat(auth-files): credential cards + bulk + dedupe — 本地已有 invertVisibleSelection+batchDownload，卡片重构破坏性大
  7495604   # fix(auth-files): batch status race — 本地已有 batchStatusPendingRef+statusUpdating cleanup 防竞态
  013759c   # feat(status-panel): compact layout — 仅为 e44a9fc 紧凑卡片配套样式，本地未启用 compact 模式
  82aa44d   # feat(auth-files): regular vs compact page sizes — e44a9fc compact 模式未采纳，独立 page-size 状态无意义
  e50e088   # feat(payload-rules): raw JSON rules — 本地已完整集成 parseRawPayloadRules/serializeRawPayloadRulesForYaml/payloadDefault|OverrideRawRules，三方合并误判冲突
  8ff2ae0   # feat(styles): mobile responsive enhancements — 紧密耦合 e44a9fc 紧凑卡片重构，本地 mobile 适配已自成体系
  5469945   # refactor: ConfigPage styling restructure — 2101 行纯样式 refactor，无 fix 价值，本地 ConfigPage/VisualConfigEditor 已有自己演进路线
  8758a75   # feat(visual-config): overview layout — 依赖刚跳过的 5469945 ConfigPage 重构
  bcaf637   # feat(config): ExpandableInput — 依赖 5469945 重构后的 VisualConfigEditor.module.scss，整文件错位无法低成本采纳
  9bd1215   # feat(styles): premium plan gradients/shadows — 纯样式增强 +280 行，非 fix 价值
  693d821   # feat(VisualConfigEditor): sidebar responsiveness — 依赖 5469945 重构系列
  2dcba43   # feat(styles): simplify filterAllIconWrap — 本地已是简化版，三方合并误判冲突
  70d7c22   # feat(styles): refactor filter section layout — 依赖 e44a9fc 卡片重构，本地 filterRail 路线已分叉
  922dc7d   # fix(auth-files): grid responsive — 本地 .fileGrid/.fileGridQuotaManaged 已是 auto-fill 版本，.fileGridCompact 紧凑模式未启用
  4587df2   # feat(AuthFilesPage): persistent compact mode — 依赖 e44a9fc 紧凑模式
  b823bc3   # feat(ConfigPage,VisualConfigEditor): page transition layer — 依赖 5469945/8758a75 重构系列
  8ac6b3b   # feat(config): mobile section quick navigation — 依赖 visual-config 重构系列
  1210383   # fix(config): tighten visual editor small-screen layout — 依赖 visual-config 重构系列
  af36f6f   # fix(config): keep mobile action status visible — 依赖 visual-config 重构系列
  208a264   # fix(config): prevent mobile section jump scroll — 依赖 visual-config 重构系列
  0273d3c   # fix(config): refresh global store after yaml save — 依赖 visual-config 重构系列
  7aa6744   # refactor(VisualConfigEditor): simplify floating — 依赖 visual-config 重构系列
  7747c95   # fix(config): visual dirty tracking strictmode — 依赖 visual-config 重构系列
  4d864d1   # refactor(authFiles): simplify filter and card styles — 依赖 e44a9fc/975d047 卡片重构
  66a0336   # perf(config): lazy-mount source editor — 依赖 visual-config 重构系列
  7333e98   # perf(config): gate visual editor observers — 依赖 visual-config 重构系列
  d94321d   # chore(config): remove unused import — 依赖 visual-config 重构系列
  f66deb3   # fix(models): cross-session stale cache — useModelsStore.ts 已先期应用 apiKey scope，useUsageStatsStore 本地已删
  a388f72   # feat(authFiles): batch upload/delete — 280+ 行 authFiles.ts 冲突与本地 codexCleanup/CodexCleanupEvent 交错，本地已有 batchDownload/invertVisibleSelection
  6006efb   # feat(ServiceHealthCard): portal tooltip — 上游改的是 src/components/usage 副本，本地已迁入 monitor，已手工移植为 2b35835
  135619f   # feat(AuthFilesPage): regex search mode — 已落地为 6d2eb5d（仅采纳 regex 部分，丢弃 compact mode 字段），patch-id 漂移导致重试
  2534578   # fix(quota): three-color thresholds — quotaConfigs.ts 常量本地已 auto-merge，themes.scss 颜色冲突保留本地 (warning/error 原色 #f59e0b/#ef4444)
  d23dadd   # feat(QuotaSection): update button styles and text — 已应用为 dde18a7（i18n 保留本地 card_idle_hint "点击此处刷新额度"，新增 refresh_all_credentials）
  4b28d8a   # refactor(auth-files): replace regex search with wildcard matching — 已应用为 13c94fa（保留本地 filterControls 结构 + 图标系统，丢弃 compact mode 相关）
  5a7b7e0   # fix(auth-files): optimize status bar cache — 本地 hook 已简化为只接收预算好的 statusBarByAuthIndex，上游 fix 基于原始 usageDetails 不兼容
  6637bc7   # perf(ai-providers): index usage details by source — 本地 useProviderStats 已在 hook 内直接产出 statusBarBySource（基于 monitorApi），不再向 Page 暴露 usageDetails；上游优化目标在本地已是更深一层等价实现
  ab6ead7   # perf(ai-providers): disable background stats refresh — 本地 useProviderStats 已有 enabled 选项 + useInterval 已 gate 在 enabled ? 240_000 : null，AiProvidersPage 已使用 isCurrentLayer 控制；上游 patch 本地已等价
  5ad32a1   # perf(styles): degrade glass blur on mobile — 依赖 5469945/8758a75/e44a9fc 等重构系列后的样式基线，本地 VisualConfigEditor/AuthFilesPage/QuotaPage SCSS 已分叉，整文件错位
  0eaf3e8   # perf(ai-providers): fully disable background refresh — 本地 useHeaderRefresh 已支持 enabled 二参 + cleanup，AiProvidersPage 已拆分 loadKeyStats useEffect 监听 isCurrentLayer，useHeaderRefresh 已传 isCurrentLayer；useProviderStats 部分不适用（本地走 monitorApi 不读 useUsageStatsStore）
  f8455dc   # perf(usage): streamline pre-index collection — 修改 6637bc7 引入的 usageIndex.ts，本地无此文件
  4d3bd27   # fix(usage): resolve nullable merge in index — 修改 6637bc7 引入的 usageIndex.ts，本地无此文件
  73e260c   # perf(ai-providers): lighten dirty checks for edits — 本地已先期包含 areKeyValueEntriesEqual/areModelEntriesEqual/areStringArraysEqual 与 EditPage 应用；冲突仅在本地多余的 parseRouteIndexParam import，解决后无新变更
  13a0283   # feat(usage): show request time in usage stats — 改的 RequestEventsDetailsCard/StatCards 本地已删，utils/usage.ts 已彻底重写为 monitorApi 链路（KeyStats+StatusBar），UsageDetail/ApiStats/filterUsageByTimeRange 等本地已不存在
  d84cf61   # feat: improve usage latency formatting — 同 13a0283，usage 链路本地已分叉
  74d9adc   # feat: add latency tracking and display enhancements across usage components — 改 ModelStatsCard/RequestEventsDetailsCard/StatCards/UsagePage.module.scss 全部已删，utils/usage.ts 分叉
  f408e56   # feat(authFiles): enhance header validation and error handling in editor — 已应用为 cbe63f8（保留 INVALID_CONTENT_PREVIEW 工具 + 引入 headers validation；本地 Modal 已有完整 headers/note/codex 输入字段，仅采纳 headersError 高亮）
  5cbfbe8   # feat(config): add antigravity credits visual toggle — 已应用为 89bcc64（保留本地 'sf' routingStrategy 选项，加入 quotaAntigravityCredits 字段 + quota 章节 ToggleRow）
  30f1450   # feat(i18n): add Traditional Chinese (Taiwan) locale — 本地 zh-TW.json 已是上游超集（包含 xAI 配额/OAuth、error_backend_detail、plan_team 等额外键），language.ts/i18n/index.ts 已是更先进版本
  70a12bb   # fix(oauth): remove qwen oauth card — 本地 qwen 已早期完整移除，剩余冲突仅在 xAI（本地独有）周围，无净变更
  74badca   # fix(oauth): remove iflow cookie login — 本地 OAuthPage/oauth.ts 已不引用 iflow，i18n 残留键无害；保留 HEAD 后无净变更
  # === OpenAI Provider UI 重构系列：本地 useProviderStats 已使用 monitorApi 链路返回 statusBarBySource:Map，上游依赖 calculateStatusBarData/usageIndex.ts/usageDetailsBySource prop（均为本地已删的 usage 基础设施）。直接 cherry-pick 会拉回整条 usage API 链路，等于回滚监控中心迁移。等价 UI 改造（排序/过滤/分页）应作为独立 PR 移植到 statusBarBySource 签名，不走 cherry-pick。 ===
  4c48567   # feat(openai): add provider sorting and model filters
  e801844   # fix: improve OpenAI provider model dropdown behavior — 依赖 4c48567
  feff3f3   # Fix provider list scope and key stability — 依赖 4c48567
  a1401d4   # feat: enhance usage tracking with auth index support across providers — 上游依赖
  a28920d   # feat: enhance source information handling and disambiguation in usage components — 上游 usage 依赖
  3896048   # feat(openai): improve floating header behavior and provider cards — 依赖 4c48567
  b753145   # fix(openai): address provider UI review feedback — 依赖 4c48567
  be92535   # fix(openai): polish provider list overlays and i18n — 依赖 4c48567
  5afc97d   # fix(i18n): complete OpenAI provider locale keys — 依赖 4c48567 引入的 i18n 键
  d8d0538   # fix(ai-providers): avoid API key in OpenAI entry keys — 依赖 4c48567
  485fcbb   # fix(ai-providers): avoid nested model filter controls — 依赖 4c48567
  3359d17   # chore(ai-providers): remove unused model search styles — 依赖 4c48567
  0bd243e   # feat(OpenAISection): enhance sorting and filtering UI components — 依赖 4c48567
  a4d1c23   # feat: add toggle functionality for enabling/disabling OpenAI providers — 依赖 4c48567 系列
  cc8632b   # fix: adjust opacity style condition for OpenAI provider card — 依赖 a4d1c23
  b25f722   # Refactor provider usage tracking to utilize recent requests data — 依赖 usage 基础设施
  011cd3b   # refactor: update provider stats functions to use total stats and improve type definitions — 依赖 usage 基础设施
  496f9900   # fix(usage): normalize high-precision RFC3339 timestamps — 已应用为 63c9cc1（仅采纳 timestamp.ts 新文件 + 本地存在的 4 处 Date.parse 替换；上游补丁触及的 usage.ts 大量函数本地已删）
  3212f65   # feat(config): add session affinity routing settings — 已应用为 e159999（合并本地 'sf' routingStrategy + 上游 session affinity 字段，UI 控件已手工注入本地 network section）
  0095933   # Enhance Dashboard and Layout Styles — 937 行 layout.scss 纯样式重构 + MainLayout 删除版本检查 Button/connectionStatus；本地 HEAD 已是 popover 模式 + 监控中心扩展，无 fix 价值
  03186e4   # feat(AiProviders): integrate OpenAI providers fetching — 依赖跳过的 OpenAI 系列 + 修改本地已删的 UsagePage.tsx
  2f2a571   # feat(AuthFiles): add disabled filter option — 已应用为 5921da8（采纳 disabledOnly + i18n disabled_filter_label/only；跳过 compactMode 字段/UI 和 regularPageSize/compactPageSize 分离）
  de97726   # feat: show thinking intensity in request events — DU 本地已删 RequestEventsDetailsCard，utils/usage.ts 已重写为 monitorApi 链路，无法采纳
  3a30fb8   # feat(LayoutStyles): remove box-shadow — 依赖 0095933 layout 重构，纯样式
  bf030d1   # Improve token type distribution readability — DU 本地已删 TokenBreakdownChart/UsagePage
  7c02cc4   # Revert "Improve token type distribution readability" — 同上，本地无目标文件
  0546f43   # fix(config): preserve antigravity credits absence — 已应用为 df8158d（合并本地 apiKeysStorageMetadata 解构 + 上游 dirtyFields 解构与 deps）
  b20ce40   # fix(styles): adjust heights for top gradient blur and main header — 纯样式微调，依赖 0095933
  7b49063   # Reapply "Improve token type distribution readability" — DU 本地已删 TokenBreakdownChart/UsagePage
  d1733497  # fix: add missing commas in TokenBreakdownChart and UsagePage — DU 本地已删
  808f44d   # fix: remove total latency references from ModelStatsCard — DU 本地已删
  7d3c570   # refactor: remove unused fields and streamline auth file editor logic — 实际改动是为 patchFields/AuthFileFieldsPatch 抽出类型 + useAuthFilesPrefixProxyEditor 268 行重构，本地无批量上传/删除基础设施且 hook 已分叉，refactor 价值有限
  632be0b   # refactor: remove unused chart configuration and latency utilities — 上游大规模 usage 系统删除（chartConfig/latency/usageIndex/usage 组件全删），本地 ServiceHealthCard/MonitorPage.module.scss 三方合并误判为待删，连带触及监控中心核心文件 19 处，破坏性过大
  6a10082   # fix(layout): move mobile sidebar toggle left — 本地已预先应用 close icon/mobile-sidebar-actions/mobileSidebarToggleLabel/sidebarOpen 切换，冲突仅在本地保留的 <div className="left"> 容器结构，净空
  15e32ee   # chore(deps): upgrade vite toolchain — Vite 7→8 + @vitejs/plugin-react 5→6 大版本升级，要求 Node 24+，与 ef7b63e 同类，本地保持 Vite 7 不升级
  9f7c471   # fix(ai-providers): prevent OpenAI provider card overflow — 本地缺 .openaiProviderList（OpenAI UI 系列已跳过），5 处冲突触及大段本地不存在的 OpenAI 类，纯 SCSS 防溢出微调
  57eeff5   # feat: add support for xAI provider with OAuth integration and localization — 本地 3bd2cca 已先期完整集成 xAI/Grok（i18n/OAuthPage/oauth.ts/constants.ts），上游 AUTH_FILE_ICONS 系统本地无使用方，仅 constants.ts 三处冲突为格式重复，cherry-pick --skip 后即净空
  a292267   # feat: add dark mode support for Grok icon and normalize provider keys across components — 主体依赖 AUTH_FILE_ICONS/getAuthFileIcon 系统（本地无），normalizeProviderKey 的 x-ai/grok 别名归一化本地后端固定枚举不需要
  9e77afa   # docs: update minimum required version and installation commands in README files — bun 切换关联文档变更，本地用 npm 且 README 已分叉
  4ef5869   # Refactor localization strings for Antigravity Credits and update ConfigPage styles — 依赖跳过的 5469945 ConfigPage 重构系列，本地 ConfigPage/VisualConfigEditor 已分叉，i18n 文案改动剥离手工不值得
  cd1e7ff   # feat: refactor ConfigSection styles to improve layout and responsiveness — DU 本地已删 ConfigSection.module.scss（5469945 重构系列），跳过
  d6f5c45   # feat(i18n): add Home control plane settings and various enhancements — 1500+ 行 visual config 大改造（Home control plane + 错误日志保留 + image generation），本地 VisualConfigEditor/useVisualConfig/visualConfig.ts 已分叉，f0d669f 又部分回滚 Home control plane
  f0d669f   # feat: remove Home control plane configuration and related validation logic — 与 d6f5c45 配对（移除其引入的 Home control plane），整对跳过
  300f73e   # fix(auth-files): handle html challenge content — useAuthFilesPrefixProxyEditor hook 已分叉，6 处冲突涉及大段重构（109+49 行），改造价值有限
  bb0c0a7   # fix(auth-files): keep invalid content copyable — 本地已先期应用 buildInvalidAuthFileContentState/buildInvalidContentPreview（line 84/109），冲突段为重复定义，净空
  77e7dd0   # feat: enhance filter controls with search functionality and style adjustments — 9 处冲突涉及本地未引入的 .filterRail/.filterContent/.filterAllIconWrap 容器结构，本地 filterControls 路线已分叉
  f8fdd9b   # chore: update dependencies and remove baseUrl from tsconfig — i18next 25→26 + react-i18next 16→17 + TypeScript 5→6 破坏性升级
  65f8b23   # fix(docs): correct minimum required version and update TypeScript version in README — TypeScript 6 文档跟随升级，本地保持 TS 5
  0fa6b74   # chore: remove unused hooks and utils — 跟随上游 deps 升级清理，本地 hook 已分叉
  a44bcd33  # feat(providers): enhance provider configuration handling and serialization — 本地 4cb222f 已是等价提交，冲突仅在本地独有 patchOpenAIProviderByName（保留），cherry-pick --skip 后净空
  9a5c2b0   # feat: add xAI/Grok quota management — 本地 3bd2cca 已是等价提交
  # === Provider Workbench 重构系列：计划跳过。34a050d 引入的新工作台依赖前面已计划跳过的 recentRequests/useProviderRecentRequests usage 链路，
  # === 本 fork 的 provider 状态条走 monitorApi/useProviderStats。直接 cherry-pick 会删除本地旧 provider 页面和监控中心扩展点，且缺失依赖文件。
  34a050d   # refactor: remove deprecated AI provider edit pages and related stores — 计划跳过，依赖已跳过的 recentRequests 工作台链路
  1ceb7e1   # feat: enhance metrics display in ProviderResourceTable — 计划跳过，依赖 34a050d Provider Workbench
  47ba6ab   # feat(providers): expose inline enable/disable toggle — 计划跳过，依赖 34a050d Provider Workbench
  bf299cf   # feat(providers): add OpenAI/Claude connectivity test — 计划跳过，依赖 34a050d Provider Workbench
  4711db9   # fix(providers): reset connectivity status — 计划跳过，依赖 bf299cf Provider Workbench 测试面板
  191a4c5   # feat(providers): add model discovery panel — 计划跳过，依赖 34a050d Provider Workbench
  fafc4b7   # feat(providers): bring back status bar/sort/model filter — 计划跳过，依赖 recentRequests 而非本地 monitorApi
  c23fd69   # fix(providers): preserve alias when applying discovered models — 计划跳过，依赖 191a4c5
  dd3c39e   # fix(providers): retry OpenAI discovery without auth — 计划跳过，依赖 Provider Workbench 测试/发现链路
  8c3c9c1   # fix(providers): confirm discarding unsaved edits — 计划跳过，依赖 ProviderSheet
  87ddd62   # feat(providers): connectivity test model dropdown — 计划跳过，依赖 ProviderSheet
  7e9c5be   # fix(providers): forward stored apiKey/authIndex — 计划跳过，依赖 Provider Workbench 测试/发现链路
  cb26c96   # fix(providers): label missing authIndex — 计划跳过，依赖 ProviderResourceTable
  48b9879   # fix(models): add authIndex request headers/signature — 本地 fe91f63 已应用 models.ts，workbench useConnectivityTest 计划跳过
  85d6b76   # feat(select/provider): small Select and provider style updates — 计划跳过，主体依赖 Provider Workbench
  844385e   # chore(providers): remove dead exports left over from refactor — 计划跳过，依赖 34a050d 删除旧 provider exports
  4142d91   # chore(ui): remove unused HeaderInputList and ModelInputList — 计划跳过，旧 provider 编辑页仍保留并可能使用
  4a7dbf2   # chore(i18n): drop ai_providers/providersPage orphans — 计划跳过，旧 provider 页面仍需要这些键
  0992b8b   # chore(types): remove AmpcodeFormState comment — 计划跳过，依赖 Provider Workbench 表单文件
  d2ab416   # fix(providers): fetch recent requests on mount — 计划跳过，依赖 recentRequests 工作台链路
  1aa9988   # fix(providers): honor authIndex for discovery/test — 计划跳过，依赖 Provider Workbench 测试/发现链路
  42c0e7b   # fix(providers): confirm discarding edits on category switch — 计划跳过，依赖 Provider Workbench
  c2b19d2   # feat(providers): add authIndex to API key entries/tests — 计划跳过，依赖 Provider Workbench
  87702bb   # feat(provider-stats): total stats in resource detail — 计划跳过，依赖 ProviderResourceTable/ResourceDetailView
  92bc5c7   # fix(ui): move add entry button to entries toolbar — 计划跳过，依赖 ProviderSheet 表单
  3ef3c68   # fix(ui): API key show/hide toggle in provider sheet — 计划跳过，依赖 ProviderSheet 表单
  c958e30   # fix(ui): connectivity status mismatch — 计划跳过，依赖 Provider Workbench
  7389de5   # fix(ui): review feedback for API key toggle PR — 计划跳过，依赖 ProviderSheet 表单
  71d7c39   # fix(providers): keep api key visibility aligned after removal — 计划跳过，依赖 ProviderSheet 表单
  97b2152   # fix(providers): remove per-key headers input — 计划跳过，依赖 ProviderSheet 表单
  7c18e4c   # fix(forms): prevent browser autofill for API key fields — 计划跳过，依赖 ProviderSheet 表单
  75da303   # refactor(forms): streamline API key state handling — 计划跳过，依赖 ProviderSheet 表单
  657e5a8   # feat(provider-sheet): add mutationDisabled prop — 计划跳过，依赖 ProviderSheet
  b1b1f96   # feat: remove quota amount display when limit is not greater than zero — 本地 4e99a7f，冲突解决后 patch-id 漂移
  232b8e7   # feat: add support for ClaudeAPI provider and related configurations — 计划跳过，依赖已跳过的 Provider Workbench/src/features/providers 架构
  d2d1cf8   # feat: add support for Gemini API in sponsor provider — 计划跳过，商业站 sponsor provider 功能且依赖 Provider Workbench
  7bad64e   # feat: update hidden provider brands and filter logic in ProvidersWorkbenchPage — 计划跳过，依赖 Provider Workbench，且会被 ca25c652 反向修正
  81e9edf   # feat: add sponsor provider to brand order list — 计划跳过，商业站 provider brand 功能且依赖 Provider Workbench
  ca25c65   # fix(providers): keep sponsor provider groups visible — 计划跳过，商业站 provider brand 功能且依赖 Provider Workbench
  # === 2026-06-28 上游同步评估：只采纳当前 fork 架构可闭合的小修，跳过 ProviderWorkbench/APIKEY.FUN 大重构链 ===
  ed4124f   # refactor: remove Gemini CLI references — 计划跳过，本地仍保留 Gemini CLI 配额/OAuth/认证文件能力
  b566884   # feat(quota): show Codex reset credit expiries — 本地 ffc93ae，保留本地重置配额文案并合并过期时间详情
  6857856   # fix(styles): ensure layout aligns items at the start — 计划跳过，目标 src/features/providers 本地不存在
  4ebcf51   # feat: add APIKEY.FUN provider support — 计划跳过，依赖本地未采纳的 ProviderWorkbench 架构
  7bb43db   # feat(provider): enhance APIKEY.FUN link — 计划跳过，依赖 4ebcf51/APIKEY.FUN ProviderWorkbench
  6861c99   # feat(button): refactor empty action button styles — 计划跳过，依赖 src/features/providers 且 quota builders 仅格式化
  87a2447   # feat(provider): APIKEY.FUN base URL handling — 计划跳过，依赖 4ebcf51/APIKEY.FUN ProviderWorkbench
  d2b7049   # feat: enhance sponsor key management and UI — 计划跳过，依赖 4ebcf51/APIKEY.FUN ProviderWorkbench
  1ab3f0d   # feat: add usage check for APIKEY.FUN — 计划跳过，依赖 4ebcf51/APIKEY.FUN ProviderWorkbench
  e7e70cc   # feat: provider logo handling for APIKEY.FUN — 计划跳过，依赖 4ebcf51/APIKEY.FUN ProviderWorkbench
  e3ca3aa   # feat: add plugin OAuth support — 本地 763caa5，按本地 OAuthPage 结构手工合并页面入口
  3db688b   # feat: APIKEY.FUN quick start panel/routing — 计划跳过，依赖 4ebcf51 且触碰 MainRoutes 本地扩展点
  88d4d2b   # feat: quick start variant support — 计划跳过，依赖 APIKEY.FUN quick start 系列
  fdd2f99   # feat: SponsorQuickStartPanel styling/layout — 计划跳过，依赖 APIKEY.FUN quick start 系列
  e33b756   # feat: dashboard quick start card — 计划跳过，依赖 APIKEY.FUN quick start 系列
  1d1955f   # feat: SponsorQuickStartPanel empty state — 计划跳过，依赖 APIKEY.FUN quick start 系列
  76cc3d9   # feat: SponsorQuickStartPanel APIKEY.FUN config — 计划跳过，依赖 APIKEY.FUN quick start 系列
  d654ec1   # feat: quick start terminology — 计划跳过，依赖 APIKEY.FUN quick start 系列
  3fc6a49   # feat: register link text — 计划跳过，依赖 APIKEY.FUN quick start 系列
  0d76721   # feat: Codex reset credits styles for auth files — 本地 fa796c1，补齐 AuthFilesPage styleMap
  e56edde   # feat: ProviderResourceTable/statusBar styles — 计划跳过，目标 src/features/providers 本地不存在
  e144cf3   # feat: reset credits expiry label GMT+8 — 净空，本地 ffc93ae 冲突合并时已采用 GMT+8
  c37b026   # refactor: readability/consistency sweep — 计划跳过，105 文件大重构且引入 AuthFilesStatusFilterCard/ProviderWorkbench 分叉结构
  2ec1a71   # feat: AuthFiles status filter modes — 计划跳过，依赖 c37b026 引入的 AuthFilesStatusFilterCard
  213671b   # refactor: AuthFilesStatusFilterCard styling — 计划跳过，依赖 c37b026 引入的 AuthFilesStatusFilterCard
  acf432b   # feat: trackWrapper thumb positioning — 计划跳过，依赖 c37b026/213671b AuthFilesStatusFilterCard
  # === 2026-06-30 上游同步评估：采纳小修并合入插件商店认证调整 ===
  3dc365f   # feat(antigravity): client user-agent builder — 本地 e61da67a cherry-pick 已应用
  07a9c82   # feat(auth-files): websocket fields for xAI — 本地已应用 provider-aware AuthFiles websockets 移植
  e5fd4af   # feat: plugin store authentication configuration — 本地 0ff11eb cherry-pick 已应用
  e9817a8   # feat: improve plugin store authentication handling — 本地 db0174d cherry-pick 已应用
  # === 2026-06-17 上游同步评估：本地等价或手工应用的小修复 ===
  868c015   # Update OAuthPage.tsx — 本地已应用 normalizeGeminiCliProjectId/projectId 规范化
  f506d33   # refactor(gemini-cli): simplify project id normalization — 本地已应用 polling 时禁用 project id 输入
  436b4b1   # feat(icons): single codex.svg — 本地已应用 codex.svg 与相关导入切换
  75f4c7c   # chore(storage): clarify obfuscation — 本地已应用 obfuscatedStorage 命名与兼容别名
  3f2078a   # feat(QuotaCard): refresh functionality — 本地已应用额度卡片刷新能力
  d0bb210   # feat(quota): add card refresh actions — 本地已应用额度卡片刷新按钮与文案
  f3b0bde   # fix(usage): guard service health tooltip anchor — 路径已迁移到 monitor，本地已应用 tooltip anchor guard
  60790b9   # feat(OAuthPage): login/view auth files after success — 本地已应用成功后登录另一个账号与查看认证文件
  126f7fa   # fix(auth-files): keep disabled card actions visible — 本地已应用 disabled 卡片仅弱化内容不弱化操作
  2cb98ad   # fix(config): preserve source draft on visual save — 本地已应用 source draft 保留逻辑
  33df506   # fix(auth-files): restore Codex websockets toggle — 本地已应用 Codex websockets 编辑字段
  8d3a482   # fix(auth-files): keep codex websocket labels translated — 本地已应用 websockets i18n
  12dfd73   # refactor(transformers): kebab-case only — 本地已应用 config transformer 别名清理
  21c2abf   # refactor(providers): kebab-case allowlists — 本地已应用 provider allowlist 清理
  5a69c8c   # refactor(providers): simplify section payload extraction — 本地已应用 section/list 提取清理
  21e9e98   # refactor(config): drop single-field aliases — 本地已应用 config single-field 清理
  fadf2a6   # refactor(api-call): drop response aliases — 本地已应用 api-call status/header 清理
  85c8b34   # refactor(auth-files): batch response simplification — 计划跳过，本地 authFilesApi 已分叉且无上游 batch normalizer
  7f29cf2   # refactor(transformers): strict boolean normalization — 本地已应用 boolean normalizer 清理
  7c1b89c   # fix(auth-files): infer single-item batch success — 计划跳过，本地 authFilesApi 已分叉且无上游 batch normalizer
  7f48799   # fix(quota): hide duplicate idle refresh action — 本地已应用为更彻底版本，仅保留 idle 可点击刷新
  5213505   # refactor(login): drop ineffective auto-login guard — 本地已应用本次同步
  93f3b6b   # perf(auth-files): sort locally — 本地已应用本次同步
  242159b   # perf(quota): drop discarded config.yaml prefetch — 本地已应用本次同步
  8891994   # fix: label codex secondary quota by window duration — 本地已应用本次同步
  e4b8721   # feat(quotaConfigs): include monthly windows in weekly slot — 本地已应用本次同步
  22cbb91   # feat(payloadRules): raw JSON parameter styling — 本地已应用 payloadRuleParamRowRaw 布局
  b273569   # feat(visualConfig): dirty payload utility — 本地已应用本次同步
  2d77fbe   # feat(quota): Xai remaining amount formatting — 本地已应用本次同步
  c74fa6d   # feat(quota): SuperGrok plan resolution — 本地已应用本次同步
  # === 2026-06-17 计划跳过：上游 UI/日志/Provider Workbench/插件大重构未纳入本 fork 路线 ===
  544b365   # feat(nav): grouped navigation metadata — 计划跳过，MainLayout/layout.scss 已与本地监控中心路线分叉
  4d6a5da   # refactor(icons, layout): SVG/layout consistency — 计划跳过，纯 UI 重构且依赖上游 layout 基线
  432438e   # style(sidebar-toggle): positioning updates — 计划跳过，纯样式且本地侧栏已分叉
  d64210f   # refactor(page-transition): transition animation updates — 计划跳过，本地 page transition 已有监控中心适配
  768da13   # style: provider workbench dimensions — 计划跳过，本地无 src/features/providers Workbench
  60092f3   # feat(logs): fullscreen logs view — 计划跳过，日志页需与 Home/cursor 系列整组移植
  8eada1c   # feat(logs): logging UI/backend updates — 计划跳过，日志/Home backend 系列未纳入本次小同步
  73066b5   # feat(i18n): provider keys detail/duplicate alias — 计划跳过，依赖上游 Provider Workbench 与本地缺失 features/providers
  a04ffb5   # feat(connectivity): Gemini support in provider tests — 计划跳过，依赖上游 Provider Workbench
  9c86908   # feat(toolbar): provider resource toolbar — 计划跳过，依赖上游 Provider Workbench
  483dad6   # feat(uiState): provider UI state persistence — 计划跳过，依赖上游 Provider Workbench
  4586b1d   # feat(logs): open/copy error log viewer — 计划跳过，日志页需与 Home/cursor 系列整组移植
  947f9f8   # feat: plugin management feature — 计划跳过，本地无插件路由/API 基础且会触碰 MainRoutes/api index
  848eefb   # feat(ui): PluginsPage restructure — 计划跳过，依赖未采纳插件管理
  7418fac   # feat(plugins): plugin resource routing — 计划跳过，依赖未采纳插件管理且触碰 MainRoutes
  4b3daa0   # feat(plugins): logo fallback/sidebar layout — 计划跳过，依赖未采纳插件管理
  67c4041   # feat(quota): subscription expiry handling — 已手工移植（+28ce5be 文案），复用 formatUnixTimestamp/appendSeparator/codexPlanSeparator 脚手架
  f3959a0   # feat(quota): manual quota reset — 计划跳过，配额订阅/重置 UX 大功能未纳入本次同步
  c7051ae   # feat(quota): reset UI refinements — 计划跳过，依赖 f3959a0 手动重置功能
  9fae287   # feat: Plugin Store page — 计划跳过，依赖未采纳插件管理
  0b56b99   # refactor(providers): remove index-based PATCH endpoints — 计划跳过，Provider API 清理需结合本地 provider 页面单独验证
  9d908fc   # refactor(providers): remove dead scaffolding — 计划跳过，依赖上游 Provider Workbench
  403c51c   # refactor(layout): drop provider sub-route transitions — 计划跳过，本地 provider 路由仍保留
  07cdc5a   # refactor(storage): remove unused helpers/aliases — 计划跳过，低价值 API 删除，保留本地兼容导出
  cd44dca   # refactor(utils): share helpers — 计划跳过，大量触碰未采纳 plugins/providers/logs 文件
  d268be1   # refactor(providers): upstream base-url normalization — 计划跳过，依赖上游 Provider Workbench
  f62b09a   # refactor(providers): brand logo map — 计划跳过，依赖上游 Provider Workbench
  5e7225d   # refactor(providers): resource view model names/priority — 计划跳过，依赖上游 Provider Workbench
  297e29b   # refactor(providers): cache invalidation cleanup — 计划跳过，依赖上游 Provider Workbench
  a4fcd76   # refactor(hooks): shared api-key resolution — 计划跳过，Dashboard/model fetching 需按本地 provider set 单独移植
  c79f58a   # perf(dashboard): derive stats from cached config — 计划跳过，本地 Dashboard provider 统计与上游 provider set 不一致
  ac9cc45   # refactor(config): table-drive scalar dirty tracking — 计划跳过，VisualConfigEditor 已分叉，需单独审
  bbd69ff   # refactor(auth-files): shared provider label — 计划跳过，OAuth edit pages 本地已分叉
  a984ce6   # refactor(layout): share popup dismiss — 计划跳过，纯重构无行为收益
  c63c43c   # refactor(hooks): action-bar height hook — 计划跳过，纯重构无行为收益
  6513903   # refactor(quota): monthly limits for team plans — 计划跳过，已手工采纳窗口秒数识别，完整 team-plan 重构暂不引入
  227a567   # refactor(plugin): feature detection/routing — 计划跳过，依赖未采纳插件管理
  6bca83f   # refactor(plugins): configuration/error handling — 计划跳过，依赖未采纳插件管理
  b75d408   # feat(config): plugin system config — 计划跳过，依赖未采纳插件管理
  e62ed4d   # feat(provider): disable cooling/model options — 计划跳过，依赖上游 Provider Workbench
  eb32567   # feat(plugins): delayed loading after mutation — 计划跳过，依赖未采纳插件管理
  e99741a   # feat(plugins): resource refresh event — 计划跳过，依赖未采纳插件管理
  1dcf8fe   # feat(logs): pagination normalization — 计划跳过，日志/Home backend 系列未纳入本次小同步
  fa93d2e   # feat(pluginStore): expandable descriptions — 计划跳过，依赖未采纳插件管理
  b9b45e9   # feat(plugins): deletion — 计划跳过，依赖未采纳插件管理
  1969de4   # Refactor: remove Ampcode integration — 计划跳过，本地仍保留 Ampcode 配置能力
  246069d   # feat(pluginStore): source information — 计划跳过，依赖未采纳插件管理
  6442c92   # feat(connectivityTest): Codex connectivity test — 计划跳过，依赖上游 Provider Workbench
  67d3fe6   # feat(pluginInstall): third-party install gate — 计划跳过，依赖未采纳插件管理
  28ce5be   # feat(i18n): expiration label renewal time — 已并入 67c4041 移植（"续期时间"/"Renewal time"/"Истекает" 均已采纳）
  729df08   # feat(logs): optimize pagination requests — 计划跳过，依赖 1dcf8fe 日志分页系列
  b5d18d8   # feat(pluginStore): default source identification — 计划跳过，依赖未采纳插件管理
  cc16be4   # feat(pluginInstall): repository link/caution text — 计划跳过，依赖未采纳插件管理
  1279cc1   # feat(pluginStore): third-party sources/config — 计划跳过，依赖未采纳插件管理
  b0db1df   # feat(logs): cursor/after incremental fetching — 计划跳过，依赖 1dcf8fe 日志分页系列
  dbeefda   # fix(plugins): poll runtime state after plugin changes — 计划跳过，依赖未采纳插件管理
  e95cc2b   # feat(quota): new quota structures/UI — 本地 ba8e3e1 已完整移植：Antigravity 新 UI（groups→buckets 分层、时间倒计时、SCSS 分组样式），保留本地 subscription 展示
  d64780f   # fix(quota): Gemini Pro Series model id → gemini-3.1 format — 本地 constants.ts 第 155 行已等价（gemini-3.1-pro-preview）
  72c0ef0   # fix(quota): localize kimi quota fallback labels — 本地 en.json kimi_quota 已含 fetch_all/weekly_limit/limit_window/limit_index/reset_hint，等价
  62587c9   # feat(quota): sync antigravity groups with latest usage models — 本地 builders.ts/constants.ts/parsers.ts 已等价（ba8e3e1 一并引入）
  ccf90f8   # feat(quota): Claude plan detection via profile API — 本地 quotaConfigs.ts 第 1217 行 parseClaudeProfilePayload + resolveClaudePlanType 已等价
  e833c03   # fix(quota): detect Claude plan from account flags — 本地 normalizeFlagValue + has_claude_max/has_claude_pro 已等价（第 1205-1241 行）
  3f1f6a1   # feat(quota): gold premium pill badge for Gemini CLI Ultra/Codex Pro — 本地 PREMIUM_GEMINI_CLI_TIER_IDS + premiumPlanValue 已等价
  7d58341   # fix(quota): distinguish codex pro plan labels — 本地 PREMIUM_CODEX_PLAN_TYPES + plan_prolite 已等价（第 947-966 行）
  c43df08   # fix(quota): detect Claude Team organizations — 本地 organization_type === 'claude_team' 已等价（第 1250 行）
  62092cc   # refactor(quotaConfigs): make Chatgpt-Account-Id header optional — 本地 if (accountId) 分支已等价（第 514、574 行）
  ea018ae   # Merge PR #316 fix/codex-team-weekly-quota-label — merge commit，内容已含于 e4b8721（已跳过）
  c595ada   # feat(antigravity): subscription management — 上游中间架构（AuthFileCard badge + useAntigravitySubscriptions hook），被上游自身 069eaf21 废弃(-82行)；本地 ddb5ce40 走 quotaConfigs 路线已等价，跳过避免回退
  d9045a7   # feat(authFiles): premium subscription badge — 上游废弃架构配套 scss；本地 ddb5ce40 已有 premiumPlanValue 等价样式，跳过
  a44bcd3   # feat(providers): config handling/serialization — 本地已 pick 为 8e6c923e（手工解决 7 处冲突，patch-id 不同故 git cherry 仍显示未应用）
  069eaf2   # feat(quota): subscription mgmt + Antigravity localization — 本地 ddb5ce40 已具备 antigravitySubscriptionApi + getAntigravityPlanLabel(free/pro/ultra/ultra-lite/unknown) + premiumPlanValue scss(含 dark 主题)，与上游终点收敛，跳过
  496f990   # fix(usage): normalize RFC3339 timestamps — 本地已应用 parseTimestamp（timestamp.ts/format.ts/constants.ts/useTraceResolver.ts），剩余 usage.ts/authFiles.ts 已分叉、RequestEventsDetailsCard 已删
  d173349   # fix: commas/formatting in TokenBreakdownChart+UsagePage — 路径已迁移，UsagePage 与 usage 组件本地已删，纯格式化无效
  # --- 上游 PR #321 feat/config-editor-simple-full-mode（6 提交，整体跳过）---
  # 计划跳过：#321 的简单/完整模式+搜索构建在 section 导航架构之上；本地 VisualConfigEditor 已刻意砍掉 section 导航/移动导航/页面过渡层（581 行 vs 上游基线 1271 行，-1138 行），与本 fork 扁平化架构决策根本对立。移植=推翻架构再重写，UX 增强不值得。
  9a154c7   # feat(config): add simple/full editor modes and task-oriented sections — #321，与本地扁平化 VisualConfigEditor 架构冲突
  b5344a7   # refactor(config): flatten advanced section and card-style simple-mode fields — #321 配套
  aa114b2   # feat: add search index for visual config editor (configSearchIndex.ts) — #321 配套，依赖 section 导航
  96e41f5   # fix(config): jump correctly across horizontally snapped sections — #321 配套，依赖 section 导航
  a1d2e11   # feat(search): keyboard navigation and highlight for search results — #321 配套
  1a8e059   # fix(config): jump request handling + Collapsible state — #321 配套
)

is_skip() {
  local h="$1"
  for skip in "${SKIP_HASHES[@]}"; do
    if [[ "$h" == "$skip"* ]]; then
      return 0
    fi
  done
  return 1
}

# 校验工作区干净 & 没有进行中的 cherry-pick
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: working tree not clean — commit or stash first" >&2
  exit 1
fi
if [[ -d .git/sequencer || -f .git/CHERRY_PICK_HEAD ]]; then
  echo "ERROR: cherry-pick in progress — finish (--continue / --skip / --abort) first" >&2
  exit 1
fi

# 记录起点便于中途回滚
START_HEAD=$(git rev-parse HEAD)
echo "starting from $START_HEAD"
echo "hash list: $HASH_FILE"
echo

processed=0
skipped_user=0
skipped_empty=0
applied=0

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" ]] && continue
  hash=$(awk '{print $1}' <<<"$line")
  title=$(cut -c42- <<<"$line")
  processed=$((processed + 1))

  if is_skip "$hash"; then
    echo "[SKIP user]  $hash  $title"
    skipped_user=$((skipped_user + 1))
    continue
  fi

  # 试探 cherry-pick
  if git cherry-pick "$hash" >/tmp/cp.out 2>&1; then
    echo "[APPLIED]    $hash  $title"
    applied=$((applied + 1))
    continue
  fi

  # cherry-pick 失败 — 判断是真冲突还是 merge=ours 导致的空提交
  if [[ -f .git/CHERRY_PICK_HEAD ]]; then
    # 仍在 cherry-pick 状态
    if git diff --cached --quiet && git diff --quiet -- ':!/.git'; then
      # 没有任何暂存/未暂存变更 → 空提交（merge=ours 全吃了）
      git cherry-pick --skip >/dev/null 2>&1
      echo "[SKIP empty] $hash  $title"
      skipped_empty=$((skipped_empty + 1))
      continue
    fi
    # 检查是否真有冲突标记或未合并文件
    if git status --porcelain | grep -q '^UU\|^AA\|^DD\|^AU\|^UA\|^DU\|^UD'; then
      echo
      echo "===================================================================="
      echo "[CONFLICT]   $hash  $title"
      echo "--------------------------------------------------------------------"
      git status --short | grep -E '^(U|A|D)[U|A|D]'
      echo "--------------------------------------------------------------------"
      echo "处理：手工解决冲突 → git add → git cherry-pick --continue → 重跑本脚本"
      echo "或：git cherry-pick --abort 放弃此 commit"
      echo "===================================================================="
      exit 2
    fi
    # 暂存/未暂存有变更但无冲突 — 异常状态，停下来让用户看
    echo
    echo "===================================================================="
    echo "[UNEXPECTED] $hash  $title"
    cat /tmp/cp.out
    echo "===================================================================="
    exit 2
  fi

  # 没有 CHERRY_PICK_HEAD 但 git 返回非零 — 不应发生
  echo "[ERROR]      $hash  $title"
  cat /tmp/cp.out
  exit 1
done < "$HASH_FILE"

echo
echo "=== 完成 ==="
echo "  扫描:      $processed"
echo "  应用:      $applied"
echo "  用户跳过:  $skipped_user"
echo "  空跳过:    $skipped_empty"
echo
echo "起点: $START_HEAD"
echo "终点: $(git rev-parse HEAD)"
