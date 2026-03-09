# Auto-Evolve 项目架构

## 项目概述

Auto-Evolve 是一个基于 LangGraph 的自我迭代 AI Agent 系统。核心是一张 LangGraph 图，包含 **Planner**（方案规划）和 **Worker**（执行反馈）两个 Agent 节点。通过 LLM 驱动自动化代码改进，所有 GitHub API 操作统一由 `core/github-tools.js` 处理。

## 目录结构

```
auto-evovle/
├── index.js              # 主入口：解析提示、初始化状态、执行 LangGraph 工作流
├── graph.js              # LangGraph 图定义：Planner → Worker 流程编排
├── state.js              # AgentStateAnnotation 状态模式
├── planner.js            # Planner Agent：任务分解、需求检查、事实核查
├── worker.js             # Worker Agent：代码生成、验证、测试
├── main.py               # Python 入口（包装器，委托给 py/main.py）
├── package.json
│
├── core/                  # Node.js 核心模块
│   ├── llm.js            # Gemini API 集成（生成方案、生成代码）
│   └── github-tools.js   # GitHub REST API（唯一实现，完整功能）
│
├── py/                    # Python 辅助工具（仅代码分析）
│   ├── __init__.py
│   ├── __main__.py
│   ├── main.py            # CLI（run / lint 子命令）
│   └── code_tools.py      # 代码质量检查（lint / complexity）
│
├── scripts/               # 部署/测试脚本
│   ├── deploy-to-repo.js
│   ├── test-pr-creation.js
│   ├── find-esm-modules.js
│   └── trigger-dev-workflow-analyze.js
│
└── docs/
    └── ARCHITECTURE.md    # 本文件
```

## 核心系统架构

### LangGraph 工作流

```
用户提示 → index.js → graph.js
                         ├── Planner Agent (planner.js)
                         │    └── 调用 core/llm.js 生成方案
                         │    └── 调用 core/github-tools.js 读取仓库
                         └── Worker Agent (worker.js)
                              └── 调用 core/llm.js 生成代码
                              └── 调用 core/github-tools.js 提交代码/创建 PR
                              └── 语法检查 / 测试执行
```

### core/github-tools.js — 完整 GitHub API

所有 GitHub 操作统一在此文件，通过 `executeGithubTool(action, input)` 分发：

| 分类 | Action | 说明 |
|------|--------|------|
| **文件** | `read_file` | 读取仓库文件 |
| | `list_directory` | 列出目录内容 |
| | `upsert_file` | 创建/更新单文件 |
| | `delete_file` | 删除文件 |
| | `commit_multiple_files` | 通过 Git Tree API 批量提交多文件 |
| **Issue** | `create_issue` | 创建 Issue |
| | `get_issue` | 获取 Issue 详情 |
| | `update_issue` | 更新 Issue（标题/正文/状态） |
| | `close_issue` | 关闭 Issue |
| | `list_issues` | 列出 Issues |
| | `comment_issue` | 评论 Issue |
| | `add_labels` | 添加标签 |
| | `remove_label` | 移除标签 |
| **PR** | `create_pull_request` | 创建 Pull Request |
| | `list_pull_requests` | 列出 PRs |
| | `get_pull_request` | 获取 PR 详情 |
| | `merge_pull_request` | 合并 PR（squash/merge/rebase） |
| | `list_pr_files` | 列出 PR 变更文件 |
| **Branch** | `create_branch` | 创建分支 |
| | `list_branches` | 列出分支 |
| | `delete_branch` | 删除分支 |
| **Actions** | `list_workflows` | 列出工作流 |
| | `list_workflow_runs` | 查看工作流运行状态 |
| | `trigger_workflow` | 手动触发工作流 |
| | `get_workflow_run_logs` | 获取运行日志/步骤 |
| | `create_scheduled_workflow` | 创建定时 Action（cron） |
| **Repo** | `get_repo_info` | 获取仓库基本信息 |

### Python 辅助工具

Python 仅保留代码分析功能，GitHub 操作全部由 JS 处理：

| 文件 | 职责 |
|------|------|
| `py/code_tools.py` | Python 代码的 lint 检查和复杂度分析 |
| `py/main.py` | CLI 入口：`run`（调用 node index.js）、`lint`（代码检查） |

## 运行项目

```bash
# Node.js LangGraph 系统
node index.js

# Python CLI
python3 -m py.main run                    # 运行 Planner/Worker
python3 -m py.main lint path/to/file.py   # 代码质量检查
```

## 环境变量

- `GEMINI_API_KEY` - Google Gemini API 密钥
- `GITHUB_TOKEN` / `GH_PAT` - GitHub 个人访问令牌
- `TARGET_REPOSITORY` - 目标仓库 (owner/repo)
- `TARGET_BRANCH` - 目标分支（默认 main）
- `ISSUE_NUMBER` - 处理的 Issue 号
- `USER_PROMPT` - 用户提示

## 后续方向

- [ ] 为 Worker Agent 添加更多工具节点（shell 执行、测试运行、代码重构等）
- [ ] 实现自我迭代闭环：Worker 执行 → 测试 → 分析失败 → 自动修复
- [ ] 补充 core/github-tools.js 的单元测试
- [ ] 添加集成测试
