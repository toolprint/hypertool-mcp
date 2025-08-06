# 📖 Toolset Examples & Recipes

## 🎨 Creative Toolset Patterns

### By Role

#### 🏗️ Full-Stack Developer
```yaml
"frontend-dev":
  tools: [react-analyzer, css-helper, browser-automation, git]
  count: 8-10 tools
  use: "React component development with testing"

"backend-api":
  tools: [express-tools, database, redis, postman, git]
  count: 10-12 tools
  use: "API development and testing"

"fullstack-deploy":
  tools: [docker, k8s, git, monitoring, logs]
  count: 12-15 tools
  use: "Deployment and DevOps tasks"
```

#### 📊 Data Scientist
```yaml
"data-exploration":
  tools: [jupyter, pandas-helper, matplotlib, filesystem]
  count: 6-8 tools
  use: "Initial data analysis and visualization"

"ml-training":
  tools: [mlflow, tensorflow-tools, gpu-monitor, s3]
  count: 8-10 tools
  use: "Model training and experiment tracking"

"data-pipeline":
  tools: [airflow, spark-tools, database, monitoring]
  count: 10-12 tools
  use: "ETL and data pipeline management"
```

#### 🎯 Product Manager
```yaml
"sprint-planning":
  tools: [jira, confluence, slack, calendar]
  count: 6-8 tools
  use: "Sprint planning and team coordination"

"user-research":
  tools: [notion, figma-comments, survey-tools, slack]
  count: 5-7 tools
  use: "User research and feedback collection"

"roadmap-work":
  tools: [productboard, sheets, slides, confluence]
  count: 6-8 tools
  use: "Product roadmap and strategy work"
```

### By Time of Day

#### ☀️ Morning Routine
```yaml
"morning-catchup":
  tools: [email, slack, calendar, linear, git]
  count: 5-7 tools
  use: "Check messages, review PRs, plan the day"
  tip: "Start your day focused on communication and planning"
```

#### 🌙 Evening Wrap-up
```yaml
"evening-review":
  tools: [git, linear, slack, notion]
  count: 4-6 tools
  use: "Commit work, update tickets, document progress"
  tip: "End your day by documenting and communicating progress"
```

### By Project Phase

#### 🚀 Project Kickoff
```yaml
"project-setup":
  tools: [github, npm-tools, filesystem, template-generator]
  count: 6-8 tools
  use: "Initialize new projects with best practices"

"requirements-gathering":
  tools: [notion, miro, slack, calendar]
  count: 5-6 tools
  use: "Gather and document project requirements"
```

#### 🏁 Project Completion
```yaml
"project-handoff":
  tools: [documentation, github, confluence, slack]
  count: 5-7 tools
  use: "Document and hand off completed projects"

"post-mortem":
  tools: [notion, miro, analytics, slack]
  count: 4-6 tools
  use: "Conduct project retrospectives"
```

## 🔄 Workflow-Based Toolsets

### Customer Support Workflow
```yaml
"ticket-triage":
  tools: [zendesk, slack, linear, knowledge-base]
  count: 5-6 tools
  workflow:
    1. Check Zendesk queue
    2. Search knowledge base
    3. Create Linear ticket if needed
    4. Update customer via Slack

"bug-reproduction":
  tools: [browser-automation, logs, database, screen-recorder]
  count: 6-8 tools
  workflow:
    1. Reproduce issue in browser
    2. Check logs for errors
    3. Query database for user state
    4. Record reproduction steps
```

### Content Creation Workflow
```yaml
"blog-writing":
  tools: [notion, grammarly, unsplash, wordpress]
  count: 5-6 tools
  workflow:
    1. Draft in Notion
    2. Grammar check with Grammarly
    3. Find images on Unsplash
    4. Publish to WordPress

"video-content":
  tools: [script-writer, teleprompter, obs-controller, youtube]
  count: 6-8 tools
  workflow:
    1. Write script
    2. Set up teleprompter
    3. Control OBS recording
    4. Upload to YouTube
```

## 🎯 Specialized Use Cases

### Security Auditing
```yaml
"security-scan":
  tools: [vulnerability-scanner, dependency-check, git-secrets, reports]
  count: 6-8 tools
  use: "Run security audits on codebases"

"incident-response":
  tools: [logs, monitoring, slack, incident-tracker, runbooks]
  count: 8-10 tools
  use: "Respond to security incidents"
```

### Performance Optimization
```yaml
"frontend-perf":
  tools: [lighthouse, webpack-analyzer, chrome-devtools, git]
  count: 5-7 tools
  use: "Optimize frontend performance"

"backend-perf":
  tools: [profiler, database-analyzer, redis-cli, monitoring]
  count: 6-8 tools
  use: "Optimize backend performance"
```

### Testing & QA
```yaml
"e2e-testing":
  tools: [playwright, percy, browserstack, test-reports]
  count: 5-7 tools
  use: "Run end-to-end tests across browsers"

"api-testing":
  tools: [postman, newman, database, mock-server]
  count: 5-6 tools
  use: "Test APIs with various scenarios"
```

## 💡 Pro Toolset Patterns

### The Minimalist Approach
Start with just 3 tools and add only when necessary:
```yaml
"minimal-dev":
  tools: [git, filesystem, terminal]
  philosophy: "Cover 80% of tasks with 20% of tools"
```

### The Swiss Army Knife
One toolset per major context switch:
```yaml
"morning": [email, slack, calendar, tasks]
"coding": [git, docker, IDE-helper]
"afternoon": [docs, diagrams, presentation]
"debugging": [logs, debugger, profiler]
```

### The Specialist Sets
Ultra-focused toolsets for specific tasks:
```yaml
"git-surgery": [git-advanced, git-history, git-recover]
"css-wizard": [css-analyzer, flexbox-helper, grid-builder]
"sql-master": [query-builder, explain-analyzer, index-advisor]
```

## 🚀 Quick Start Templates

### For New Developers
```bash
# Start with these three toolsets
"learning": [documentation, tutorial-runner, git]
"practice": [filesystem, terminal, simple-git]
"help": [stack-overflow, documentation, slack]
```

### For Team Leads
```bash
# Manage team and code
"team-mgmt": [slack, calendar, linear, 1-on-1-notes]
"code-review": [git, github, linter, test-runner]
"planning": [roadmap, estimation, resource-planner]
```

### For Consultants
```bash
# Client-specific toolsets
"client-a": [their-git, their-slack, their-jira]
"client-b": [their-azure, their-teams, their-ado]
"consulting": [time-tracker, invoice, calendar]
```

## 📝 Creating Your Own Patterns

### Questions to Ask

1. **What's the primary goal?**
   - Focus tools around a single objective

2. **What's the workflow?**
   - Order tools by typical usage sequence

3. **What's rarely used?**
   - Remove tools used less than once per week

4. **What causes context switching?**
   - Group tools that are used together

### Naming Conventions

**Good Names** ✅
- `customer-support`
- `morning-standup`
- `bug-investigation`
- `deploy-production`

**Bad Names** ❌
- `toolset1`
- `misc-tools`
- `everything`
- `temp`

### Evolution Strategy

1. **Week 1**: Start with 3-5 tools
2. **Week 2**: Add 1-2 tools based on friction
3. **Week 3**: Remove unused tools
4. **Week 4**: Finalize and document

## 🎨 Share Your Patterns!

Have a great toolset pattern? Share it with the community:

1. Export your toolset (when available)
2. Document the use case
3. Share in [GitHub Discussions](https://github.com/toolprint/hypertool-mcp/discussions)

Remember: The best toolset is the one that makes YOU most productive!
