#!/usr/bin/env node

/**
 * Workflow Analysis Script
 * Analyzes GitHub Actions workflow runs and identifies issues
 */

import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';

dotenv.config();

const OWNER = 'masteraux101';
const REPO = 'auto-evolve';
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('❌ GITHUB_TOKEN not found in .env file');
  process.exit(1);
}

const octokit = new Octokit({ auth: TOKEN });

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function analyzeBranch() {
  log(colors.bold + colors.cyan, '\n=== 分析远程 dev 分支 ===\n');
  
  try {
    // Get branch info
    const { data: branch } = await octokit.repos.getBranch({
      owner: OWNER,
      repo: REPO,
      branch: 'dev'
    });
    
    log(colors.green, `✓ 分支: dev`);
    log(colors.green, `✓ 最新提交: ${branch.commit.sha.substring(0, 7)}`);
    log(colors.green, `✓ 提交信息: ${branch.commit.commit.message}`);
    log(colors.green, `✓ 作者: ${branch.commit.commit.author.name}`);
    log(colors.green, `✓ 时间: ${branch.commit.commit.author.date}`);
    
    // Get recent commits
    const { data: commits } = await octokit.repos.listCommits({
      owner: OWNER,
      repo: REPO,
      sha: 'dev',
      per_page: 10
    });
    
    log(colors.bold + colors.yellow, '\n最近10次提交:');
    commits.forEach((commit, index) => {
      log(colors.yellow, `  ${index + 1}. ${commit.sha.substring(0, 7)} - ${commit.commit.message.split('\n')[0]}`);
      log(colors.yellow, `     作者: ${commit.commit.author.name}, 时间: ${commit.commit.author.date}`);
    });
    
    // Check key files
    log(colors.bold + colors.cyan, '\n检查关键文件:');
    const keyFiles = ['index.js', 'planner.js', 'worker.js', 'llm.js', 'github-tools.js', '.github/workflows/local-auto-evolve.yml'];
    
    for (const file of keyFiles) {
      try {
        const { data: fileData } = await octokit.repos.getContent({
          owner: OWNER,
          repo: REPO,
          path: file,
          ref: 'dev'
        });
        const size = fileData.size;
        log(colors.green, `  ✓ ${file} (${size} bytes)`);
      } catch (error) {
        if (error.status === 404) {
          log(colors.red, `  ✗ ${file} - 文件不存在!`);
        } else {
          log(colors.red, `  ✗ ${file} - 错误: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    log(colors.red, `❌ 分析分支失败: ${error.message}`);
    if (error.status === 404) {
      log(colors.red, '   dev 分支可能不存在');
    }
  }
}

async function analyzeWorkflowRuns() {
  log(colors.bold + colors.cyan, '\n=== 分析工作流运行 ===\n');
  
  try {
    // Get workflow runs
    const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
      owner: OWNER,
      repo: REPO,
      per_page: 20,
      branch: 'dev'
    });
    
    if (runs.total_count === 0) {
      log(colors.yellow, '⚠️  没有找到工作流运行记录');
      return;
    }
    
    log(colors.green, `找到 ${runs.total_count} 次工作流运行\n`);
    
    const issues = [];
    const suggestions = [];
    
    for (const run of runs.workflow_runs.slice(0, 10)) {
      log(colors.bold, `\n--- 运行 #${run.run_number} ---`);
      log(colors.blue, `状态: ${run.status} | 结论: ${run.conclusion || 'N/A'}`);
      log(colors.blue, `工作流: ${run.name}`);
      log(colors.blue, `分支: ${run.head_branch}`);
      log(colors.blue, `提交: ${run.head_sha.substring(0, 7)}`);
      log(colors.blue, `创建时间: ${run.created_at}`);
      log(colors.blue, `URL: ${run.html_url}`);
      
      // Analyze run status
      if (run.conclusion === 'failure') {
        issues.push(`运行 #${run.run_number} 失败`);
        
        try {
          // Get jobs for this run
          const { data: jobs } = await octokit.actions.listJobsForWorkflowRun({
            owner: OWNER,
            repo: REPO,
            run_id: run.id
          });
          
          log(colors.yellow, '\n  作业详情:');
          for (const job of jobs.jobs) {
            log(colors.yellow, `    - ${job.name}: ${job.conclusion || job.status}`);
            
            if (job.conclusion === 'failure') {
              issues.push(`  作业 "${job.name}" 失败 (运行 #${run.run_number})`);
              
              // Get job logs
              try {
                const { data: logs } = await octokit.actions.downloadJobLogsForWorkflowRun({
                  owner: OWNER,
                  repo: REPO,
                  job_id: job.id
                });
                
                // Parse logs for errors
                const logText = logs.toString();
                const errorLines = logText.split('\n').filter(line => 
                  line.toLowerCase().includes('error') || 
                  line.toLowerCase().includes('failed') ||
                  line.toLowerCase().includes('exception')
                );
                
                if (errorLines.length > 0) {
                  log(colors.red, `\n    错误日志片段 (${errorLines.length} 行):`);
                  errorLines.slice(0, 10).forEach(line => {
                    log(colors.red, `      ${line.substring(0, 150)}`);
                  });
                }
              } catch (logError) {
                log(colors.red, `    无法获取日志: ${logError.message}`);
              }
            }
          }
        } catch (jobError) {
          log(colors.red, `  获取作业详情失败: ${jobError.message}`);
        }
      } else if (run.conclusion === 'success') {
        log(colors.green, '  ✓ 运行成功');
      } else if (run.status === 'in_progress') {
        log(colors.cyan, '  ⟳ 运行中...');
      } else if (run.conclusion === 'cancelled') {
        log(colors.yellow, '  ✗ 已取消');
      }
    }
    
    // Analyze patterns
    log(colors.bold + colors.cyan, '\n=== 问题分析 ===\n');
    
    const successCount = runs.workflow_runs.filter(r => r.conclusion === 'success').length;
    const failureCount = runs.workflow_runs.filter(r => r.conclusion === 'failure').length;
    const cancelledCount = runs.workflow_runs.filter(r => r.conclusion === 'cancelled').length;
    
    log(colors.blue, `成功: ${successCount} | 失败: ${failureCount} | 取消: ${cancelledCount}`);
    
    if (failureCount > successCount) {
      suggestions.push('失败率过高，需要检查工作流配置和代码质量');
    }
    
    if (cancelledCount > 5) {
      suggestions.push('取消次数过多，可能存在配置问题或运行时间过长');
    }
    
    // Check for common issues
    const recentRuns = runs.workflow_runs.slice(0, 5);
    const allFailed = recentRuns.every(r => r.conclusion === 'failure');
    if (allFailed && recentRuns.length > 0) {
      issues.push('最近的所有运行都失败了 - 存在严重问题!');
      suggestions.push('检查最新提交是否引入了关键错误');
    }
    
    // Print issues
    if (issues.length > 0) {
      log(colors.bold + colors.red, '\n发现的问题:');
      issues.forEach((issue, i) => {
        log(colors.red, `  ${i + 1}. ${issue}`);
      });
    }
    
    // Print suggestions
    if (suggestions.length > 0) {
      log(colors.bold + colors.yellow, '\n改进建议:');
      suggestions.forEach((suggestion, i) => {
        log(colors.yellow, `  ${i + 1}. ${suggestion}`);
      });
    }
    
  } catch (error) {
    log(colors.red, `❌ 分析工作流失败: ${error.message}`);
    if (error.status === 404) {
      log(colors.red, '   可能没有配置工作流或仓库不存在');
    }
  }
}

async function analyzeWorkflowFiles() {
  log(colors.bold + colors.cyan, '\n=== 分析工作流文件 ===\n');
  
  try {
    const { data: workflows } = await octokit.actions.listRepoWorkflows({
      owner: OWNER,
      repo: REPO
    });
    
    if (workflows.total_count === 0) {
      log(colors.red, '❌ 没有找到工作流文件');
      log(colors.yellow, '建议: 确保 .github/workflows/ 目录下有 YAML 文件');
      return;
    }
    
    log(colors.green, `找到 ${workflows.total_count} 个工作流:\n`);
    
    for (const workflow of workflows.workflows) {
      log(colors.blue, `工作流: ${workflow.name}`);
      log(colors.blue, `  路径: ${workflow.path}`);
      log(colors.blue, `  状态: ${workflow.state}`);
      log(colors.blue, `  ID: ${workflow.id}\n`);
      
      // Get workflow file content
      try {
        const pathParts = workflow.path.split('/').slice(1); // Remove .github
        const { data: fileData } = await octokit.repos.getContent({
          owner: OWNER,
          repo: REPO,
          path: workflow.path,
          ref: 'dev'
        });
        
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        
        log(colors.magenta, '  工作流内容预览:');
        const lines = content.split('\n').slice(0, 30);
        lines.forEach(line => {
          log(colors.magenta, `    ${line}`);
        });
        
        // Check for common issues in workflow
        const issues = [];
        if (!content.includes('GITHUB_TOKEN')) {
          issues.push('未使用 GITHUB_TOKEN - 可能无法访问仓库');
        }
        if (!content.includes('GEMINI_API_KEY')) {
          issues.push('未配置 GEMINI_API_KEY - AI 功能无法工作');
        }
        if (!content.includes('npm install') && !content.includes('yarn install')) {
          issues.push('未安装依赖 - 运行可能失败');
        }
        
        if (issues.length > 0) {
          log(colors.red, '\n  潜在问题:');
          issues.forEach(issue => log(colors.red, `    - ${issue}`));
        }
        
      } catch (error) {
        log(colors.red, `  无法读取文件内容: ${error.message}`);
      }
    }
    
  } catch (error) {
    log(colors.red, `❌ 分析工作流文件失败: ${error.message}`);
  }
}

async function analyzeCodeQuality() {
  log(colors.bold + colors.cyan, '\n=== 代码质量分析 ===\n');
  
  const filesToCheck = [
    'index.js',
    'planner.js', 
    'worker.js',
    'llm.js',
    'github-tools.js'
  ];
  
  const issues = [];
  
  for (const file of filesToCheck) {
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: OWNER,
        repo: REPO,
        path: file,
        ref: 'dev'
      });
      
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      
      log(colors.blue, `\n检查 ${file}:`);
      
      // Check for error handling
      const hasTryCatch = content.includes('try') && content.includes('catch');
      if (!hasTryCatch) {
        issues.push(`${file}: 缺少错误处理 (try-catch)`);
        log(colors.red, '  ✗ 缺少错误处理');
      } else {
        log(colors.green, '  ✓ 有错误处理');
      }
      
      // Check for logging
      const hasLogging = content.includes('console.log') || content.includes('console.error');
      if (!hasLogging) {
        issues.push(`${file}: 缺少日志输出`);
        log(colors.red, '  ✗ 缺少日志');
      } else {
        log(colors.green, '  ✓ 有日志输出');
      }
      
      // Check for async/await
      const hasAsync = content.includes('async') && content.includes('await');
      log(colors.blue, `  ${hasAsync ? '✓' : '✗'} 使用 async/await`);
      
      // Check for environment variables
      if (file === 'llm.js' || file === 'github-tools.js') {
        const hasEnvCheck = content.includes('process.env');
        if (!hasEnvCheck) {
          issues.push(`${file}: 未检查环境变量`);
          log(colors.red, '  ✗ 未使用环境变量');
        } else {
          log(colors.green, '  ✓ 使用环境变量');
        }
      }
      
      // Check file size
      const lines = content.split('\n').length;
      log(colors.blue, `  行数: ${lines}`);
      if (lines > 500) {
        issues.push(`${file}: 文件过大 (${lines} 行) - 考虑拆分`);
      }
      
      // Check for TODOs/FIXMEs
      const todos = content.match(/TODO|FIXME|XXX/gi);
      if (todos) {
        log(colors.yellow, `  ⚠ 找到 ${todos.length} 个 TODO/FIXME`);
      }
      
    } catch (error) {
      log(colors.red, `  ✗ 无法读取 ${file}: ${error.message}`);
      issues.push(`${file}: 无法读取文件`);
    }
  }
  
  if (issues.length > 0) {
    log(colors.bold + colors.red, '\n代码质量问题:');
    issues.forEach((issue, i) => {
      log(colors.red, `  ${i + 1}. ${issue}`);
    });
  } else {
    log(colors.bold + colors.green, '\n✓ 代码质量检查通过');
  }
}

async function generateReport() {
  log(colors.bold + colors.cyan, '\n=== 生成改进报告 ===\n');
  
  const recommendations = [
    '1. 增强错误处理: 确保所有 API 调用都有适当的 try-catch',
    '2. 添加详细日志: 在关键步骤输出日志，便于调试',
    '3. 超时处理: 为长时间运行的操作添加超时机制',
    '4. 重试逻辑: 对网络请求添加重试机制',
    '5. 状态验证: 在执行操作前验证状态是否有效',
    '6. 输入验证: 验证所有用户输入和环境变量',
    '7. 测试覆盖: 添加单元测试和集成测试',
    '8. 文档补充: 为关键函数添加详细注释',
    '9. 配置验证: 启动时验证所有必需的配置',
    '10. 资源清理: 确保操作完成后清理资源'
  ];
  
  log(colors.yellow, '核心改进建议:\n');
  recommendations.forEach(rec => {
    log(colors.yellow, rec);
  });
  
  log(colors.bold + colors.green, '\n=== 分析完成 ===\n');
}

async function main() {
  console.log(colors.bold + colors.cyan, '');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║     GitHub Actions 工作流分析工具 v1.0           ║');
  console.log('║     Repository: masteraux101/auto-evolve         ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  try {
    await analyzeBranch();
    await analyzeWorkflowFiles();
    await analyzeWorkflowRuns();
    await analyzeCodeQuality();
    await generateReport();
  } catch (error) {
    log(colors.red, `\n❌ 分析过程中发生错误: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
