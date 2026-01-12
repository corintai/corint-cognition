# CORINT Risk Agent Development TODO

> Priority: **P0** = MVP 必须, **P1** = 重要但可延后, **P2** = 未来增强

---

## Phase 1: Project Foundation (P0)

### 1.1 Project Setup
- [ ] Initialize TypeScript monorepo with npm workspaces
- [ ] Configure ESLint, Prettier, tsconfig
- [ ] Setup build pipeline (esbuild/tsup)
- [ ] Create package structure:
  - [ ] `packages/agent-core`
  - [ ] `packages/agent-tools`
  - [ ] `packages/agent-skills`
  - [ ] `packages/agent-cli`

### 1.2 LLM Integration
- [ ] Implement LLM abstraction layer
- [ ] Add OpenAI GPT-4 provider
- [ ] Add Anthropic Claude provider
- [ ] Add DeepSeek provider
- [ ] Implement streaming response handling
- [ ] Implement tool/function calling interface

---

## Phase 2: Agent Core (P0)

### 2.1 Orchestrator (`orchestrator.ts`)
- [ ] Main agent loop implementation
- [ ] Message routing (user → planning → execution → evaluation)
- [ ] Session lifecycle management
- [ ] Async execution with progress updates
- [ ] User interruption handling

### 2.2 Planning Module (`planner.ts`)
- [ ] Intent classification
- [ ] Task decomposition (goal → task list)
- [ ] Dynamic plan revision:
  - [ ] `decompose` mode
  - [ ] `overwrite` mode
- [ ] TODO list generation with dependencies

### 2.3 Execution Module (`executor.ts`)
- [ ] Task Manager (status tracking, dependency resolution)
- [ ] Tool registry and dispatcher
- [ ] Retry mechanism (action-level, task-level)
- [ ] Parallel executor (concurrent tool calls)

### 2.4 Evaluation Module (`evaluator.ts`)
- [ ] Result synthesis
- [ ] Confidence scoring (high/medium/low)
- [ ] Validation & error detection
- [ ] Plan adjustment trigger
- [ ] User escalation logic

### 2.5 Context Manager
- [ ] Session Memory (conversation history)
- [ ] Working Memory (intermediate results, task state)
- [ ] User Profile (cross-session preferences)

### 2.6 Cost Controller
- [ ] Token budget tracking (100K default)
- [ ] Query limit enforcement (50/task)
- [ ] Timeout control
- [ ] Cost alerts and notifications

---

## Phase 3: Foundation Tools (P0)

### 3.1 Data Access Tools
- [ ] `query_sql` - SQL query execution
  - [ ] PostgreSQL connector
  - [ ] MySQL connector
  - [ ] ClickHouse connector
- [ ] `explore_schema` - Schema introspection
- [ ] `call_api` - REST API client

### 3.2 File Tools
- [ ] `read_file` - File reading (text, binary, Excel, CSV)
- [ ] `write_file` - File writing
- [ ] `list_files` - Directory listing with glob patterns

### 3.3 Code Execution Tools
- [ ] `execute_code` - Python code execution in sandbox
- [ ] `run_shell` - Shell command execution
- [ ] Sandbox environment setup (Docker-based)

---

## Phase 4: Domain Calculation Tools (P0)

### 4.1 Model Metrics
- [ ] `calculate_metrics` - KS, AUC, PSI, IV, Gini

### 4.2 Risk Analysis
- [ ] `calculate_vintage` - Vintage matrix
- [ ] `calculate_dpd_distribution` - DPD distribution
- [ ] `calculate_flow_rate` - Flow rate matrix

### 4.3 Strategy Simulation
- [ ] `simulate_threshold` - Single threshold simulation
- [ ] `simulate_strategy` - Multi-threshold strategy simulation
- [ ] `backtest_rule` - Rule backtesting

### 4.4 RDL Validation
- [ ] `validate_rdl` - Syntax validation
- [ ] `validate_semantics` - Semantic validation

---

## Phase 5: Domain Action Tools (P1)

### 5.1 Deployment
- [ ] `deploy_config` - Config deployment to repository
- [ ] `rollback_config` - Version rollback
- [ ] Checkpoint mechanism implementation

### 5.2 Experimentation
- [ ] `create_ab_test` - A/B test creation
- [ ] `stop_ab_test` - A/B test termination

### 5.3 Reporting
- [ ] `export_report` - Report export (PDF, Excel, HTML)

---

## Phase 6: CLI Interface (P0)

### 6.1 Core CLI
- [ ] Interactive REPL mode
- [ ] Command parsing and routing
- [ ] Streaming output display
- [ ] Tool call visualization

### 6.2 User Experience
- [ ] Progress indicators
- [ ] Confirmation dialogs (for destructive operations)
- [ ] History and session management
- [ ] `/restore` command for checkpoint rollback

---

## Phase 7: Knowledge Base (P1)

### 7.1 Domain Knowledge
- [ ] Domain concepts repository (DPD, KS, AUC, Vintage...)
- [ ] RDL syntax & templates
- [ ] Strategy patterns library
- [ ] Best practices documentation

### 7.2 Project Config
- [ ] CORINT.md file parsing
- [ ] Project-specific context injection

### 7.3 Self-Evolution
- [ ] Knowledge ADD/MODIFY/DELETE operations
- [ ] User feedback learning loop

---

## Phase 8: Skills System (P1)

### 8.1 Skills Registry
- [ ] Skill discovery and loading
- [ ] Skill execution engine
- [ ] Natural language trigger matching

### 8.2 Built-in Skills
- [ ] `daily_report` - Risk daily report generation
- [ ] `rule_optimization` - Rule threshold optimization
- [ ] `vintage_analysis` - Vintage analysis report
- [ ] `strategy_comparison` - Multi-strategy comparison
- [ ] `anomaly_investigation` - Anomaly root cause analysis

### 8.3 Custom Skills
- [ ] Markdown skill file parser
- [ ] Skill validation
- [ ] Team skill sharing (repository integration)

---

## Phase 9: MCP Extensions (P1)

### 9.1 MCP Client
- [ ] MCP protocol implementation
- [ ] Server discovery and connection
- [ ] Dynamic tool registration

### 9.2 Data Source Connectors
- [ ] Spark SQL MCP server
- [ ] Snowflake MCP server
- [ ] Custom data source template

---

## Phase 10: Web API Server (P2)

### 10.1 API Server
- [ ] REST API endpoints
- [ ] WebSocket for streaming
- [ ] Authentication & authorization

### 10.2 Web UI
- [ ] Manus-like conversational interface
- [ ] Visualization components (charts, tables)
- [ ] Rule editor with syntax highlighting

---

## Phase 11: Testing & Quality (P0)

### 11.1 Unit Tests
- [ ] Agent core module tests
- [ ] Tool implementation tests
- [ ] LLM integration tests (mocked)

### 11.2 Integration Tests
- [ ] End-to-end workflow tests
- [ ] Data source connectivity tests

### 11.3 Evaluation
- [ ] Offline eval set creation
- [ ] Accuracy metrics tracking
- [ ] Regression testing pipeline

---

## Phase 12: Documentation (P1)

### 12.1 Developer Docs
- [ ] TOOL_SPECS.md - Tool specifications
- [ ] EXAMPLES.md - Usage examples
- [ ] API documentation

### 12.2 User Docs
- [ ] Getting started guide
- [ ] Skill authoring guide
- [ ] FAQ and troubleshooting

---

## Milestone Summary

| Milestone | Scope | Target |
|-----------|-------|--------|
| **M1: Core Loop** | Project setup + LLM integration + Basic orchestrator | - |
| **M2: Tool MVP** | Foundation tools + 2-3 domain tools + CLI | - |
| **M3: Full Tools** | All P0 tools + Retry mechanism + Cost control | - |
| **M4: Skills** | Skills system + Built-in skills | - |
| **M5: Production** | MCP + Checkpoint + Security + Logging | - |

---

**Last Updated**: 2026-01-12
