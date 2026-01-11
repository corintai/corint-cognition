# CORINT Risk Agent Design

## Executive Summary

CORINT Risk Agent is an AI-native assistant designed for risk management professionals, enabling natural language interaction with the CORINT decision engine for risk analysis, strategy optimization, model iteration, anomaly detection, and data analytics.

**Design Philosophy**: Simplicity, Transparency, Tool-centric

**Target Users**: Risk analysts, modelers, data scientists, and business stakeholders

---

## 1. Design Principles

### 1.1 Core Principles (Based on Anthropic Agent Research)

1. **Simplicity First**
   - Start with simple prompts and workflows
   - Add complexity only when necessary
   - Prefer deterministic flows over autonomous decision-making

2. **Transparency & Explainability**
   - Every decision must be explainable
   - Show intermediate reasoning steps
   - Provide evidence and data sources

3. **Tool-Centric Design**
   - Agent as orchestrator, not executor
   - Well-documented tool interfaces
   - Clear input/output contracts

4. **Human-in-the-Loop**
   - Agent suggests, human approves
   - Critical operations require confirmation
   - Iterative refinement workflow

5. **DSL-Native**
   - Generate CORINT RDL (Rules, Rulesets, Pipelines)
   - Leverage existing compiler and runtime
   - No runtime LLM dependencies in production

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                      │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │     CLI      │  │   Web UI     │                         │
│  │   Terminal   │  │   Dashboard  │                         │
│  └──────┬───────┘  └──────┬───────┘                         │
└─────────┼──────────────────┼─────────────────────────────────┘
          │                  │
          └──────────────────┼──────────────────
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  CORINT Risk Agent Core                      │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │         Agent Orchestrator                          │     │
│  │  - Intent Understanding                             │     │
│  │  - Task Planning & Decomposition                    │     │
│  │  - Tool Selection & Invocation                      │     │
│  │  - Result Synthesis                                 │     │
│  └────────────────┬───────────────────────────────────┘     │
│                   │                                          │
│  ┌────────────────┴───────────────────────────────────┐     │
│  │           Tool Registry & Executor                  │     │
│  └────────────────┬───────────────────────────────────┘     │
└───────────────────┼──────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Tools                             │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Analysis    │  │  Generation  │  │  Execution   │      │
│  │   Tools      │  │    Tools     │  │    Tools     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│  • Query Decision  • Generate RDL    • Test Rules           │
│  • Analyze Metrics • Optimize Rules  • Deploy Config        │
│  • Find Patterns   • Create Features • Backtest Strategy     │
│  • Detect Anomaly  • Gen SQL Query   • A/B Test              │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              CORINT Decision Engine Stack                    │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Decision   │  │  Repository  │  │   Runtime    │      │
│  │    Engine    │  │   (DSL)      │  │   Services   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│  ┌──────┴──────────────────┴──────────────────┴───────┐     │
│  │            Data Sources & Storage                   │     │
│  │  • PostgreSQL  • Redis  • ClickHouse                │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Agent Workflow Patterns

### 3.1 Workflow vs Agent Decision

**Workflow** (Deterministic): Pre-defined steps with clear paths
- Rule testing workflow
- Deployment pipeline
- Report generation

**Agent** (Autonomous): Model makes routing decisions
- Open-ended analysis
- Strategy optimization
- Root cause investigation

### 3.2 Common Patterns

#### Pattern 1: Prompt Chaining
Sequential tool invocations with context passing.

```
User: "Why is the decline rate increasing?"

Step 1: Query decision metrics (past 7 days)
  ↓ [metrics data]
Step 2: Identify top declining rules
  ↓ [rule IDs + scores]
Step 3: Analyze rule trigger patterns
  ↓ [pattern analysis]
Step 4: Generate insights + recommendations
  ↓ [final report]
```

#### Pattern 2: Routing
Classify intent and route to specialized handlers.

```
User Input
    ↓
Intent Classification
    ├─→ "analyze" → Analysis Agent
    ├─→ "generate" → Generation Agent
    ├─→ "optimize" → Optimization Agent
    └─→ "debug" → Debug Agent
```

#### Pattern 3: Parallelization
Execute independent tasks concurrently.

```
User: "Analyze user_123's risk profile"

Parallel Execution:
├─→ Query transaction history
├─→ Query behavior features
├─→ Query device fingerprints
└─→ Query graph connections

Aggregate Results → Final Report
```

#### Pattern 4: Orchestrator-Workers
Orchestrator plans, workers execute.

```
Orchestrator: Break down "optimize fraud detection"
    ├─→ Worker 1: Analyze false positive cases
    ├─→ Worker 2: Test rule threshold variations
    ├─→ Worker 3: Evaluate feature importance
    └─→ Worker 4: Generate optimized ruleset

Orchestrator: Synthesize results → Final strategy
```

#### Pattern 5: Evaluator-Optimizer
Iterative improvement loop.

```
Generate Rule → Test → Evaluate
                  ↓
            Acceptable? ─NO→ Optimize → Generate Rule
                  ↓ YES
              Return Final Rule
```

---

## 4. Tool Categories & Specifications

### 4.1 Analysis Tools

#### Tool: `query_decision_results`
**Purpose**: Query historical decision results from database

**Input**:
```json
{
  "filters": {
    "pipeline_id": "string (optional)",
    "decision": "approve|decline|review (optional)",
    "start_time": "ISO8601 timestamp",
    "end_time": "ISO8601 timestamp"
  },
  "aggregation": "count|sum|avg|group_by",
  "group_by": "pipeline_id|decision|triggered_rule"
}
```

**Output**:
```json
{
  "results": [
    {
      "key": "fraud_detection",
      "count": 1523,
      "approval_rate": 0.87,
      "decline_rate": 0.08,
      "review_rate": 0.05
    }
  ],
  "total": 1523,
  "time_range": "2025-01-04 to 2025-01-11"
}
```

---

#### Tool: `analyze_rule_performance`
**Purpose**: Analyze rule effectiveness and patterns

**Input**:
```json
{
  "rule_id": "string",
  "time_window": "1h|24h|7d|30d",
  "metrics": ["trigger_rate", "precision", "recall", "false_positive_rate"]
}
```

**Output**:
```json
{
  "rule_id": "high_velocity_login",
  "trigger_count": 342,
  "trigger_rate": 0.034,
  "precision": 0.76,
  "false_positive_rate": 0.24,
  "common_patterns": [
    "Triggers most at 2-4 AM UTC",
    "80% involve new devices",
    "Top country: US (45%)"
  ],
  "recommendations": [
    "Consider tightening threshold from 5 to 3",
    "Add device_age condition"
  ]
}
```

---

#### Tool: `detect_anomalies`
**Purpose**: Detect statistical anomalies in features or metrics

**Input**:
```json
{
  "feature_name": "string",
  "entity_id": "string (optional)",
  "method": "zscore|iqr|isolation_forest",
  "window": "7d|30d|90d",
  "threshold": 3.0
}
```

**Output**:
```json
{
  "anomalies_detected": 12,
  "details": [
    {
      "entity_id": "user_8392",
      "feature": "txn_amount",
      "value": 15000,
      "expected_range": [100, 500],
      "zscore": 5.2,
      "timestamp": "2025-01-11T10:23:45Z"
    }
  ]
}
```

---

### 4.2 Generation Tools

#### Tool: `generate_rule`
**Purpose**: Generate CORINT RDL rule from natural language

**Input**:
```json
{
  "description": "Flag transactions over $10,000 from accounts less than 30 days old",
  "rule_type": "fraud|compliance|behavior",
  "score": 80
}
```

**Output**:
```yaml
rule:
  id: high_amount_new_account
  name: High Amount from New Account
  description: Flag transactions over $10,000 from accounts less than 30 days old
  
  when:
    all:
      - event.type == "transaction"
      - event.amount > 10000
      - event.account.age_days < 30
  
  score: 80
  reason: "High-value transaction from new account"
```

---

#### Tool: `generate_ruleset`
**Purpose**: Generate ruleset with decision logic

**Input**:
```json
{
  "description": "Account takeover detection with 3 rules",
  "rules": ["new_device_login", "unusual_location", "behavior_anomaly"],
  "strategy": "score_based",
  "thresholds": {
    "deny": 150,
    "review": 100,
    "approve": 0
  }
}
```

**Output**:
```yaml
ruleset:
  id: takeover_detection
  name: Account Takeover Detection
  
  rules:
    - new_device_login
    - unusual_location
    - behavior_anomaly
  
  decision_logic:
    - condition: total_score >= 150
      action: deny
      reason: "High takeover risk"
    - condition: total_score >= 100
      action: review
      reason: "Medium takeover risk"
    - default: true
      action: approve
```

---

#### Tool: `generate_feature`
**Purpose**: Generate feature definition from description

**Input**:
```json
{
  "description": "Count user's failed login attempts in past 1 hour",
  "feature_type": "aggregation",
  "datasource": "postgresql_events"
}
```

**Output**:
```yaml
- name: cnt_userid_failed_login_1h
  type: aggregation
  method: count
  datasource: postgresql_events
  entity: events
  dimension: user_id
  dimension_value: "{event.user_id}"
  window: 1h
  when:
    all:
      - type == "login"
      - status == "failed"
```

---

### 4.3 Execution Tools

#### Tool: `test_rule`
**Purpose**: Test rule against sample events

**Input**:
```json
{
  "rule_yaml": "string (YAML content)",
  "test_events": [
    {
      "type": "transaction",
      "amount": 12000,
      "account": {"age_days": 15}
    }
  ]
}
```

**Output**:
```json
{
  "results": [
    {
      "event_index": 0,
      "triggered": true,
      "score": 80,
      "reason": "High-value transaction from new account"
    }
  ]
}
```

---

#### Tool: `backtest_strategy`
**Purpose**: Backtest rule/ruleset on historical data

**Input**:
```json
{
  "config_yaml": "string (Rule/Ruleset YAML)",
  "data_source": "decision_results",
  "start_date": "2025-01-01",
  "end_date": "2025-01-11",
  "sample_size": 10000
}
```

**Output**:
```json
{
  "total_samples": 10000,
  "triggered": 340,
  "true_positives": 258,
  "false_positives": 82,
  "true_negatives": 9500,
  "false_negatives": 160,
  "precision": 0.758,
  "recall": 0.617,
  "f1_score": 0.680,
  "recommendations": [
    "Increase threshold to reduce false positives",
    "Precision is good, but recall is low - consider adding more conditions"
  ]
}
```

---

#### Tool: `deploy_config`
**Purpose**: Deploy rule/ruleset to repository

**Input**:
```json
{
  "config_type": "rule|ruleset|pipeline|feature",
  "config_yaml": "string (YAML content)",
  "target_path": "repository/library/rules/fraud/new_rule.yaml",
  "dry_run": false
}
```

**Output**:
```json
{
  "status": "success",
  "deployed_to": "repository/library/rules/fraud/new_rule.yaml",
  "validation": {
    "syntax": "valid",
    "semantic": "valid",
    "conflicts": []
  }
}
```

---

### 4.4 Data Tools

#### Tool: `query_features`
**Purpose**: Query feature values for specific entities

**Input**:
```json
{
  "entity_type": "user|transaction|device",
  "entity_id": "string",
  "features": ["cnt_login_24h", "sum_txn_amt_7d", "distinct_device_30d"]
}
```

**Output**:
```json
{
  "entity_id": "user_123",
  "features": {
    "cnt_login_24h": 5,
    "sum_txn_amt_7d": 15000,
    "distinct_device_30d": 3
  },
  "timestamp": "2025-01-11T10:30:00Z"
}
```

---

#### Tool: `explore_schema`
**Purpose**: Explore database schema and available fields

**Input**:
```json
{
  "datasource": "postgresql_events",
  "entity": "events|users|transactions"
}
```

**Output**:
```json
{
  "entity": "events",
  "fields": [
    {"name": "id", "type": "UUID", "description": "Event ID"},
    {"name": "type", "type": "STRING", "description": "Event type"},
    {"name": "user_id", "type": "STRING", "description": "User identifier"},
    {"name": "amount", "type": "DECIMAL", "description": "Transaction amount"},
    {"name": "timestamp", "type": "TIMESTAMP", "description": "Event time"}
  ]
}
```

---

## 5. Conversation Examples

### Example 1: Risk Analysis

```
User: "Why did the decline rate increase yesterday?"

Agent: I'll analyze the decline rate trend. Let me query the decision results...

[Tool: query_decision_results]
{
  "filters": {"start_time": "2025-01-10T00:00:00Z", "end_time": "2025-01-11T00:00:00Z"},
  "aggregation": "group_by",
  "group_by": "decision"
}

Result: Decline rate increased from 8% to 15% (875 more declines).

Let me identify which rules contributed most...

[Tool: analyze_rule_performance]
{
  "time_window": "24h",
  "metrics": ["trigger_rate"]
}

Analysis:
- Rule "high_velocity_login" triggers increased 3x
- Rule "new_device_risk" triggers increased 2x
- Most declines occurred 2-4 AM UTC

Root cause: Possible bot attack targeting account login.

Recommendation: 
1. Review "high_velocity_login" threshold (currently 5 attempts/hour)
2. Consider adding CAPTCHA challenge instead of direct decline
3. Monitor pattern over next 24h

Would you like me to generate an optimized ruleset?
```

---

### Example 2: Strategy Optimization

```
User: "Optimize the fraud detection ruleset to reduce false positives"

Agent: I'll analyze the current fraud detection performance...

[Tool: query_decision_results + analyze_rule_performance]

Current metrics:
- Precision: 0.76 (24% false positives)
- Recall: 0.82
- Top FP contributors: "high_amount_txn" (45%), "velocity_check" (30%)

Let me backtest threshold adjustments...

[Tool: backtest_strategy with variations]

Tested 5 configurations:
1. Original: Precision 0.76, Recall 0.82
2. Increase high_amount threshold: Precision 0.83, Recall 0.78 ✓
3. Add device_age condition: Precision 0.81, Recall 0.80 ✓
4. Remove velocity_check: Precision 0.72, Recall 0.85 ✗

Best configuration: #2 + #3 combined
- Precision: 0.85 (+12%)
- Recall: 0.79 (-4%)
- F1-score: 0.82 (+5%)

Generated optimized ruleset:

[Shows optimized YAML]

Would you like me to:
A) Deploy to staging for A/B test
B) Backtest on larger dataset
C) Adjust parameters further
```

---

### Example 3: Feature Discovery

```
User: "Find features that correlate with fraud for user transactions"

Agent: I'll analyze feature importance for fraud detection...

[Tool: query_features + detect_anomalies]

Analyzing 50 features across 10,000 transactions (2,000 fraud cases)...

Top 10 features correlated with fraud:

1. **distinct_device_7d** (correlation: 0.68)
   - Fraudulent: avg 4.2 devices
   - Normal: avg 1.3 devices
   
2. **cnt_failed_login_24h** (correlation: 0.62)
   - Fraudulent: avg 8.5 attempts
   - Normal: avg 0.4 attempts

3. **txn_amount_zscore** (correlation: 0.55)
   - Fraudulent: avg 3.8σ deviation
   - Normal: avg 0.2σ deviation

[... more features ...]

Recommendation: Add these features to your fraud ruleset:
- Create rule for distinct_device_7d > 3
- Strengthen failed login threshold to 5 (current: 10)

Would you like me to generate a new rule incorporating these features?
```

---

## 6. Implementation Plan

### Phase 1: Foundation (Week 1-2)
- [ ] Agent orchestrator framework (Rust + LLM provider integration)
- [ ] Tool registry and execution framework
- [ ] Basic CLI interface
- [ ] 5 core tools: query_decision_results, generate_rule, test_rule, analyze_rule_performance, deploy_config

### Phase 2: Analysis Capabilities (Week 3-4)
- [ ] Advanced query tools (aggregations, filtering)
- [ ] Anomaly detection tool
- [ ] Feature exploration tool
- [ ] Schema introspection tool
- [ ] Backtest framework

### Phase 3: Generation & Optimization (Week 5-6)
- [ ] Ruleset generation
- [ ] Feature generation
- [ ] Pipeline generation
- [ ] Strategy optimization tool (threshold tuning, feature selection)
- [ ] A/B test framework

### Phase 4: Workflows & UI (Week 7-8)
- [ ] Pre-defined workflows (analysis, optimization, deployment)
- [ ] Web dashboard integration
- [ ] Conversation history & context management
- [ ] Multi-turn optimization loops

---

## 7. Technical Stack

### Core Components
- **Language**: Rust (agent core, tools, integration with corint-decision)
- **LLM Integration**: 
  - OpenAI GPT-4 Turbo (primary)
  - Anthropic Claude 3.5 Sonnet (alternative)
  - DeepSeek (cost-effective option)
- **Tool Execution**: Async Rust with Tokio
- **DSL Generation**: Leverage `corint-llm` crate

### Architecture Modules
```
corint-cognition/
├── crates/
│   ├── corint-agent-core/        # Agent orchestrator
│   │   ├── orchestrator.rs       # Main agent loop
│   │   ├── intent_classifier.rs  # Intent understanding
│   │   ├── planner.rs            # Task planning
│   │   └── synthesizer.rs        # Result synthesis
│   ├── corint-agent-tools/       # Tool implementations
│   │   ├── analysis/             # Analysis tools
│   │   ├── generation/           # Generation tools
│   │   ├── execution/            # Execution tools
│   │   └── data/                 # Data tools
│   ├── corint-agent-cli/         # CLI interface
│   └── corint-agent-server/      # Web API (future)
├── config/
│   └── agent.yaml                # Agent configuration
└── docs/
    ├── AGENT_DESIGN.md           # This file
    ├── TOOL_SPECS.md             # Tool specifications
    └── EXAMPLES.md               # Usage examples
```

---

## 8. Configuration

### Agent Configuration (`config/agent.yaml`)
```yaml
agent:
  name: "CORINT Risk Agent"
  version: "0.1.0"
  
  llm:
    provider: openai
    model: gpt-4-turbo
    temperature: 0.3
    max_tokens: 4000
    
  tools:
    enabled:
      - query_decision_results
      - analyze_rule_performance
      - detect_anomalies
      - generate_rule
      - generate_ruleset
      - generate_feature
      - test_rule
      - backtest_strategy
      - deploy_config
      - query_features
      - explore_schema
      
  workflows:
    analysis_workflow:
      steps:
        - query_metrics
        - identify_issues
        - generate_insights
    optimization_workflow:
      steps:
        - analyze_performance
        - generate_variations
        - backtest
        - select_best
        
  decision_engine:
    repository_path: "../corint-decision/repository"
    database_url: "postgresql://localhost/corint"
    
  safety:
    require_approval_for:
      - deploy_config
      - modify_production
    dry_run_default: true
```

---

## 9. Safety & Governance

### Human-in-the-Loop Controls
1. **Confirmation Required** for:
   - Deploying configurations to production
   - Modifying live rules/rulesets
   - Deleting decision history
   
2. **Dry-run by Default**:
   - All write operations default to dry-run mode
   - Explicit `--execute` flag required for actual changes

3. **Audit Logging**:
   - All agent actions logged with timestamps
   - Tool invocations and results recorded
   - User confirmations tracked

### Rate Limiting
- Max 100 LLM calls per session
- Max 10 concurrent tool executions
- Backtest limited to 50K samples per run

---

## 10. Success Metrics

### Efficiency Metrics
- **Time to Insight**: Reduce analysis time from hours to minutes
- **Iteration Speed**: Enable 10x faster rule optimization cycles
- **Automation Rate**: Automate 70% of routine analysis tasks

### Quality Metrics
- **Rule Quality**: Generated rules pass validation 95%+ of time
- **Recommendation Accuracy**: 80%+ of optimization suggestions improve metrics
- **User Satisfaction**: NPS score > 50

### Adoption Metrics
- **Daily Active Users**: Target 80% of risk team
- **Tasks Automated**: Track # of analyses, generations, deployments
- **Collaboration**: Measure sharing of agent-generated insights

---

## 11. Comparison: Risk Agent vs Other AI Agents

| Feature | CORINT Risk Agent | Manus | Claude Code | Cursor |
|---------|------------------|-------|-------------|--------|
| **Domain** | Risk Management | General Purpose | Code Generation | Code Editing |
| **DSL Generation** | CORINT RDL (YAML) | N/A | Multiple languages | Multiple languages |
| **Data Analysis** | Built-in (SQL, metrics) | Limited | Limited | Limited |
| **Backtesting** | Native support | N/A | N/A | N/A |
| **Tool Ecosystem** | Risk-specific tools | General tools | Code tools | IDE tools |
| **Production Deploy** | Integrated with engine | N/A | N/A | N/A |
| **Explainability** | First-class (risk audit) | General | Code comments | Code suggestions |

---

## 12. Future Enhancements

### Short-term (3 months)
- Multi-agent collaboration (analysis agent + generation agent)
- Advanced visualization (decision trees, feature importance plots)
- Integration with Slack/Teams for notifications
- Scheduled reports and monitoring

### Long-term (6-12 months)
- Autonomous strategy optimization (continuous learning)
- Graph analysis tools (fraud rings, account networks)
- Model training and feature engineering automation
- Multi-tenant support for enterprise deployments

---

## References

1. Anthropic: Building Effective Agents - https://www.anthropic.com/engineering/building-effective-agents
2. CORINT Decision Engine Architecture - `../corint-decision/docs/ARCHITECTURE.md`
3. CORINT DSL Design - `../corint-decision/docs/DSL_DESIGN.md`
4. CORINT LLM Guide - `../corint-decision/docs/LLM_GUIDE.md`

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-11  
**Status**: Design Phase