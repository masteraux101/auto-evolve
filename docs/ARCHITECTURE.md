# Auto-Evolve 项目架构

## 项目概述

Auto-Evolve 是一个结合 Node.js 和 Python 的自动代码演化系统，利用 LLM（大语言模型）和 GitHub 工作流实现自动化代码改进和 PR 创建。

## 目录结构

```
auto-evovle/
├── core/                      # Node.js 核心模块
│   ├── llm.js               # Gemini API 集成
│   ├── github-tools.js      # GitHub REST API 包装器
│   └── analyze-log.js       # GitHub Actions 日志分析
│
├── __tests__/               # 测试文件（按语言分组）
│   ├── node/               # JavaScript 测试
│   │   ├── auto_pr_feature.test.js
│   │   └── services.test.js
│   └── python/             # Python 测试
│       ├── test_auto_pr.py
│       ├── test_git_handler.py
│       ├── test_github_automation.py
│       └── test_github_client.py
│
├── .build/                  # 构建输出和生成文件
│   ├── dist/               # 分发构建目录
│   └── generated/          # 生成的文件
│
├── py/                      # Python 模块（辅助系统）
│   ├── main.py            # Python 入口点
│   ├── auto_pr.py         # 自动 PR 工作流
│   ├── code_tools.py      # 代码质量检查工具
│   ├── github_tools.py    # GitHub API 工具
│   ├── git_handler.py     # Git 操作处理
│   ├── git_utils.py       # Git 工具函数
│   ├── github_client.py   # GitHub 客户端
│   └── features/          # 功能模块
│       └── auto_pr.py     # PR 创建功能实现
│
├── src/                     # 其他源文件
│   ├── controllers/        # 控制器
│   ├── services/          # 服务
│   └── ...其他文件
│
├── scripts/                # 自动化脚本
│   └── deploy-to-repo.js
│
├── .github/               # GitHub 配置
│   └── workflows/         # CI/CD 工作流
│       └── local-auto-evolve.yml
│
├── docs/                  # 文档
│   ├── ARCHITECTURE.md   # 本文件
│   └── DEVELOPMENT.md    # 开发指南（待创建）
│
# Node.js 核心入口点和主要文件
├── index.js              # 主入口点
├── graph.js              # LangGraph 工作流定义
├── state.js              # 工作流状态定义
├── planner.js            # 任务规划节点
├── worker.js             # 代码生成节点
│
# 配置文件
├── package.json          # Node.js 依赖
├── tsconfig.json         # TypeScript 配置
├── .env                  # 环境变量（本地）
│
# Python 入口点
└── main.py              # Python 入口点（包装器）
```

## 核心系统架构

### Node.js LangGraph 系统（主系统）

**目的**: 基于 LLM 的自动化代码演化和改进

**组件**:

1. **index.js** - 主入口点
   - 解析用户提示
   - 初始化工作流状态
   - 执行 LangGraph 工作流
   - GitHub 问题结果回写

2. **graph.js** - LangGraph 工作流定义
   - 定义规划和工作流程
   - 路由决策逻辑
   - 工作流完成条件

3. **state.js** - 工作流状态注解
   - 定义状态模式
   - 类型检查和验证

4. **planner.js** - 规划节点 (~8276 行)
   - 任务分解和规划
   - 需求检查
   - 事实检查反馈处理
   - 调用 LLM 进行规划

5. **worker.js** - 工作节点 (~8282 行)
   - 代码生成
   - 代码验证
   - 测试运行
   - 调用 LLM 进行实现

### 核心模块（/core/）

1. **llm.js** - LLM 集成
   - Gemini API 调用
   - 请求重试和错误处理
   - 模型配置管理

2. **github-tools.js** - GitHub API 集成
   - 分支创建
   - PR 创建
   - 问题评论
   - 文件提交

3. **analyze-log.js** - 工作流日志分析
   - GitHub Actions 日志解析
   - 执行结果分析
   - 失败信息提取

### Python 辅助系统（/py/）

**目的**: 代码质量验证和 GitHub 自动化支持

**主要组件**:

1. **code_tools.py** - 代码分析
   - 代码检测（pylint）
   - 复杂度检查（radon）
   - 代码质量评分

2. **github_tools.py** - GitHub API 工具
   - PR 创建
   - 分支管理
   - 文件提交

3. **auto_pr.py** - 自动 PR 工作流
   - 分支创建
   - 代码验证
   - PR 提交
   - 端到端工作流编排

4. **git_handler.py & git_utils.py** - Git 操作
   - 本地 Git 命令执行
   - 仓库状态管理

## 文件移动记录

### 重新组织（2024-03-08）

从混乱的结构重新整理为清晰的语言隔离组织：

**移动到 /core/**:
- `llm.js` - 从根目录
- `github-tools.js` - 从根目录
- `analyze-workflow.js` → `analyze-log.js` - 重命名并移动

**删除（重复文件）**:
- `src/auto_pr.py` - 重复，已删除（保留 py/auto_pr.py）
- `src/code_tools.py` - 重复，已删除（保留 py/code_tools.py）
- `src/git_handler.py` - 重复，已删除（保留 py/git_handler.py）
- `src/git_utils.py` - 重复，已删除（保留 py/git_utils.py）
- `src/github_*.py` - 重复文件，已删除
- `src/features/` - 重复目录，已删除

**整理测试**:
- `tests/*.test.js` → `__tests__/node/`
- `tests/*.py` → `__tests__/python/`
- `py/tests/*.py` → `__tests__/python/`

**生成文件**:
- `generated/` → `.build/generated/`

## 导入路径更新

### 更新的 imports

```javascript
// index.js
import { createBranch, createPullRequest } from "./core/github-tools.js";

// planner.js
import { generatePlan } from "./core/llm.js";

// worker.js
import { generateTaskOutput } from "./core/llm.js";
```

## 运行项目

### Node.js LangGraph 系统

```bash
# 基本运行
node index.js

# 使用环境变量设置提示
USER_PROMPT="improve code quality" node index.js

# 设置 API 密钥
export GEMINI_API_KEY="your-api-key"
export GITHUB_TOKEN="your-github-token"
node index.js
```

### Python 模块

```bash
# 运行主模块
python3 main.py

# 导入特定功能
python3 -c "from py.auto_pr import create_pr_workflow; create_pr_workflow(...)"
```

## 测试

```bash
# 运行 JavaScript 测试
npm test

# 运行 Python 测试
python3 -m pytest __tests__/python/
```

## 环境变量

关键环境变量（见 `.env.example`）:

- `GEMINI_API_KEY` - Google Gemini API 密钥
- `GITHUB_TOKEN` - GitHub 个人访问令牌
- `TARGET_REPOSITORY` - 目标仓库 (owner/repo)
- `GITHUB_REPOSITORY` - GitHub Actions 自动设置
- `ISSUE_NUMBER` - 处理的题号
- `USER_PROMPT` - 用户提示（如果不通过其他方式提供）

## 依赖关系

### Node.js

- `@langchain/langgraph` - LangGraph 工作流
- `@anthropic-ai/sdk` 或类似 - LLM 调用
- 见 `package.json` 获取完整列表

### Python

- `requests` - HTTP 请求
- `PyGithub` - GitHub API
- `pylint`, `radon` - 代码分析
- 见 `py/requirements.txt` 获取完整列表

## 后续任务

- [ ] 创建 `docs/DEVELOPMENT.md` - 开发指南
- [ ] 为 `/docs/` 编写模块 API 文档
- [ ] 集成 PR 创建到 GitHub Actions 工作流
- [ ] 添加性能基准测试
- [ ] 完整集成测试
