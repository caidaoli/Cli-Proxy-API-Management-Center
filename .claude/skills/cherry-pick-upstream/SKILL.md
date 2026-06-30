---
name: cherry-pick-upstream
description: Use when syncing this fork with router-for-me/Cli-Proxy-API-Management-Center by cherry-picking specific upstream commits; forbid git merge, protect local monitor/OAuth/provider/i18n customizations, and maintain SKIP_HASHES.
---

# Cherry-Pick 上游代码

本项目与上游仓库结构差异较大，**禁止使用 `git merge`**，只能通过 `git cherry-pick` 逐个摘取需要的提交。

## 客户端入口

Claude 和 Codex 必须使用同一个物理 skill 目录，避免 cherry-pick 后 `SKIP_HASHES` 或脚本逻辑不同步。

| 客户端 | 入口 | 说明 |
|--------|------|------|
| Claude | `.claude/skills/cherry-pick-upstream/` | 物理目录，维护 `SKILL.md` 与 `cherry-pick-batch.sh` |
| Codex | `.agents/skills/cherry-pick-upstream` | symlink，必须指向同一个 `.claude` 目录 |

批处理脚本只维护这一份：

```bash
bash .claude/skills/cherry-pick-upstream/cherry-pick-batch.sh [hash-list-file]
```

不要在 `.agents` 下复制 `SKILL.md` 或 `cherry-pick-batch.sh`。

## Remote 说明

| Remote | 仓库 | 策略 |
|--------|------|------|
| `original-upstream` | router-for-me/Cli-Proxy-API-Management-Center | cherry-pick（唯一上游来源，不含监控中心） |

> kongkongyo/Cli-Proxy-API-Management-Center（原 `upstream`）已停产，不再作为同步来源。

## 前置条件

- 工作区干净（无未提交的更改）
- 已配置 `original-upstream` remote

## Cherry-Pick 流程

### 1. 检查工作区状态

```bash
git status
git remote -v
```

确认：
- 工作区干净，无未提交更改
- `original-upstream` remote 已正确配置
- 如未配置：`git remote add original-upstream https://github.com/router-for-me/Cli-Proxy-API-Management-Center.git`

### 2. 获取上游最新代码

```bash
git fetch original-upstream
```

### 3. 列出上游新提交

```bash
# 查看本地还没有的上游提交（按时间正序，便于挑选）
git log HEAD..original-upstream/main --oneline --reverse

# 查看每个提交涉及的文件
git log HEAD..original-upstream/main --oneline --stat --reverse
```

**向用户展示提交列表**，让用户决定要 cherry-pick 哪些提交。如果用户没有指定，默认逐个分析每个提交的内容，给出建议：
- **推荐摘取**: bug 修复、安全更新、共享组件改进
- **需谨慎**: 涉及路由、页面结构、i18n 主文件的变更
- **建议跳过**: 与本 fork 已有功能冲突的变更

### 4. 分析提交安全性

对每个待 cherry-pick 的提交，检查其涉及的文件：

```bash
git show <commit-hash> --stat
```

**高风险文件**（涉及这些文件时需特别小心）：
- `src/router/MainRoutes.tsx` — 可能删除 `...localRoutes`
- `src/services/api/index.ts` — 可能删除 `export * from './local'`
- `src/stores/index.ts` — 可能删除 `export * from './local'`
- `src/i18n/index.ts` — 可能破坏本地翻译合并逻辑
- `src/i18n/locales/*.json` — 可能覆盖本地新增的 key（如 `nav.monitor`）

**本地独有文件**（上游不存在，如被修改说明提交有问题）：
- `src/components/monitor/*`
- `src/pages/MonitorPage.*`
- `src/pages/OAuthPage.*`
- `src/services/api/monitor.ts`、`src/services/api/local.ts`
- `src/stores/local.ts`
- `src/router/localRoutes.tsx`
- `src/i18n/locales/*-local.json`

### 5. 执行 Cherry-Pick

逐个摘取（**不要批量**，便于逐个处理冲突）：

```bash
git cherry-pick <commit-hash>
```

如果一次要摘取多个连续提交，也可以按顺序：
```bash
git cherry-pick <oldest-hash>^..<newest-hash>
```

### 6. 处理冲突（如有）

如果出现冲突：

1. `git status` 查看冲突文件列表
2. 逐个处理冲突文件：
   - 读取文件内容，理解冲突双方的意图
   - **优先保留本地的定制代码**（与 merge 策略相反）
   - 采用上游的 bug 修复和功能改进
3. 标记冲突已解决：`git add <file>`
4. 继续 cherry-pick：`git cherry-pick --continue`

**冲突处理原则（与 merge 模式不同）：**
- **优先保留本地的架构和定制功能**
- 只采纳上游提交中有价值的具体变更
- 本地独有文件的任何删除操作必须还原
- 高风险文件中本地的 `import`/`export` 扩展点必须保留
- 如果不确定，询问用户

### 7. 放弃当前 Cherry-Pick

如果某个提交冲突太严重，不值得摘取：

```bash
git cherry-pick --abort
```

### 8. 验证

每个 cherry-pick 完成后：

```bash
# 类型检查
npm run type-check

# 构建验证
npm run build
```

如果构建失败，立即修复，不要继续下一个 cherry-pick。

## 加速：快速评估剩余候选

`git cherry` 用 patch-id 比对，**本地手工解决过冲突的提交即使功能等价也会持续显示为未应用**。每次同步前，先过滤掉 `cherry-pick-batch.sh` 的 `SKIP_HASHES`：

```bash
# 全部未应用提交
git cherry main original-upstream/main | awk '$1=="+" {print $2}' > /tmp/unpicked_all.txt

# 提取 SKIP_HASHES（含等价标注）
grep -E '^[[:space:]]*[0-9a-f]{7,}' .claude/skills/cherry-pick-upstream/cherry-pick-batch.sh \
  | awk '{print $1}' | sort -u > /tmp/skip_hashes.txt

# 取差集
comm -23 <(cut -c1-7 /tmp/unpicked_all.txt | sort) <(sort /tmp/skip_hashes.txt) > /tmp/candidates_short.txt
wc -l /tmp/candidates_short.txt
```

剩下的才是**真正需要人工评估的候选**。配合 `git log -1 --format='%h %s' <hash>` 批量打印标题，再决定是否 `git show <hash>` 看细节。

## 路径迁移表（必须重定向，不能直接 cherry-pick）

上游某些文件在本 fork 中已被迁移或删除，遇到这些路径的 patch 时**绝不要直接 cherry-pick**，而是把 hunk 手工应用到本地对应位置（或确认本地已等价）：

| 上游路径 | 本地处理 | 说明 |
|---|---|---|
| `src/components/usage/ServiceHealthCard.tsx` | 重定向到 `src/components/monitor/ServiceHealthCard.tsx` | v1.15.0 已迁入 monitor 副本 |
| `src/components/usage/*`（其他） | 通常**跳过** | Usage 页面已删，仅 ServiceHealthCard 保留 |
| `src/pages/UsagePage.*` | **跳过** | Usage 页面已删 |
| `src/utils/usage.ts` | 谨慎评估 | 本地保留但已分叉，多数上游 refactor 无效 |
| `src/utils/latency.ts` 等 usage 周边工具 | **跳过** | 多数被上游删除时本地已先删除 |

操作流程：
1. 用 `git cherry-pick --no-commit <hash>` 拿到 staged 改动
2. `git reset HEAD <上游路径>` 取消该文件的暂存
3. 手工把 hunk 应用到本地对应路径（用 Edit 工具）
4. `git add <本地路径>` + `git commit -m "..."`，**在提交信息中标注上游 hash 与重定向原因**

示例：本会话的 `f3b0bde3` → `2bc4b34 fix(monitor): guard service health tooltip anchor`。

## 净空判定捷径

如果 `git cherry-pick <hash>` 后立即收到：

```
The previous cherry-pick is now empty, possibly due to conflict resolution.
```

说明上游补丁的改动在本地已 100% 等价存在。直接：

```bash
git cherry-pick --skip
```

然后**把该 hash 加入 `SKIP_HASHES`，注释里写明本地等价提交 hash**，下次同步自动跳过：

```bash
75f4c7c   # chore(storage): clarify obfuscation — 自动合并后净空，本地早期已等价
3f2078a   # feat(QuotaCard): refresh functionality — 本地 84d252c8 同名提交
```

## 等价提交标注规范

新增 `SKIP_HASHES` 条目时，注释**必须**包含以下信息之一：

- `本地 <短hash>` — 指向本地等价提交
- `本地已应用 <feature>` — 描述本地已具备的等价能力
- `净空` — git 自动判定为空，无需进一步动作
- `计划跳过` — 出自历史决策（如主题、依赖大版本升级）
- `路径已迁移` — 配合「路径迁移表」使用

这样下次同步时，看 `cherry-pick-batch.sh` 的 SKIP 段就知道每个跳过项的来源，无需重新调查。

## 提交信息格式

cherry-pick 会自动保留原始提交信息。如果需要修改：

```bash
git cherry-pick --no-commit <hash>
# 手动调整后
git commit -m "cherry-pick: <原始描述>"
```

## 完成后

**向用户提供摘取总结**，包括：
- 成功 cherry-pick 的提交数量和 hash 列表
- 跳过的提交及跳过原因
- 冲突解决情况说明
- 构建验证结果

## 故障排除

### cherry-pick 后构建失败

1. 检查是否遗漏了相关的依赖提交
2. 检查 import 路径是否因上游重构而变化
3. 必要时手动适配代码

### 上游重构了共享文件

如果上游对共享文件做了大幅重构（如 `client.ts`、路由结构），不要直接 cherry-pick，而是：
1. 理解上游变更的意图
2. 手动将相同的改进应用到本地代码
3. 保留本地的扩展点和定制逻辑
