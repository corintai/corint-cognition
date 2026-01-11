# CORINT Risk Agent Requirements

## 0. Design References

### 0.1 Product References
- **Web UI**: 参考 [Manus](https://www.manus.app/) 的对话式交互体验
  - 自然语言驱动的工作流
  - 可视化结果展示
  - 多轮对话上下文管理
  
- **CLI**: 参考 [Anthropic Claude Code](https://docs.anthropic.com/en/docs/agents) 的命令行交互方式
  - 交互式 REPL 模式
  - 工具调用透明化
  - 支持脚本化执行

### 0.2 Agent Design Principles
>参考Manus两位创始人的访谈
- **Agent架构**：由三部分组成；大脑（LLM），环境（Sandbox+Rumtime），执行工具（Tools）
- **Model-driven**: 不预设人工规则或复杂的工作流（Workflow），而是主张由大模型本身决定完成任务的路径
- **Planning Stage**: 有单独的规划阶段，将复杂任务拆解为多步计划（Plan），并根据环境反馈（Observation）不断调整。
- **Coding & Tools Calling**：能自己写代码、调试、运行，调用API 以及工具，从而能胜任各种长尾任务
- **异步通信与插嘴机制**：不需要问一句回一句，而是异步执行任务并同步进度，在必要时请求用户介入，在执行过程中用户也可以随时插嘴补充信息、改变目标或终止任务。
- **Sandbox云端沙盒机制**：为每个会话分配一个独立、隔离的云端虚拟化环境，从而保证安全性并方便Agent持续执行长链路的任务
- **Scale Out**： 通过Wide Research等功能，可以启动上百个Sandbox并行完成子任务，最后进行汇总，实现超越人类单体效率的产出

> 参考Claude Skills
- 用户可以自定义自己的Skills，用来进行Agent能力的扩展和约束规范

---

## 1. Target Users

### Primary Users
- **Risk Strategy Analysts**: 负责设计和优化风控策略的分析师
- **Risk Modeling Engineers**: 负责特征工程和模型开发的工程师
- **Business Stakeholders**: 管理层和运营人员，关注业务指标

### User Personas
- **Alice (Strategy Analyst)**: 每天需要分析通过率、拒绝率变化，找出异常规则，调优阈值
- **Bob (Modeling Engineer)**: 需要快速验证新特征效果，回测策略表现，部署新规则
- **Carol (Business Manager)**: 需要查看风控报表，理解策略影响，做业务决策

---

## 2. Application Scenarios

### 2.1 Primary Scenarios (Phase 1)
- **Credit Risk Management**: 信贷审批、额度管理、逾期预测
- **Fraud Detection**: 交易反欺诈、账户盗用检测、虚假身份识别

### 2.2 Extended Scenarios (Future)
- **Payment Risk**: 支付欺诈、洗钱检测
- **E-commerce Risk**: 恶意刷单、虚假评论、账号养号
- **Insurance Risk**: 骗保检测、理赔审核

---

## 3. Core Objectives

### 3.1 User Experience Goal
让用户能够像使用 **Manus** 一样，通过自然语言描述，完成日常风控工作：
- "为什么昨天拒绝率上升了？"
- "优化欺诈检测规则，降低误伤率"
- "生成一条规则：用户 7 天内登录次数超过 10 次且来自 3 个不同设备，则拒绝"

### 3.2 Technical Goals
- **DSL Generation**: 自动生成 CORINT RDL（Rules, Rulesets, Pipelines）
- **Iterative Workflow**: 支持多轮对话、迭代优化
- **Production-Ready**: 生成的代码可直接部署到生产环境进行A/B Test

---

## 4. Functional Requirements

### 4.1 Core Capabilities

#### 4.1.1 Risk Analysis
- Query historical decision results (通过率、拒绝率、审核率)
- Analyze rule performance (触发率、精准率、误报率)
- Detect anomalies in features/metrics (异常用户、异常交易)
- Root cause investigation (为什么某条规则突然触发增多)
- Pattern discovery (发现潜在欺诈模式)

#### 4.1.2 Strategy Generation
- Generate rules in CORINT RDL syntax
- Create rulesets and pipelines
- Generate feature definitions
- Optimize thresholds and weights

#### 4.1.3 Testing & Validation
- Syntax validation (RDL 语法检查)
- Semantic validation (规则逻辑校验)
- Backtest on historical data (回测策略表现)
- A/B test framework (策略对比实验)

#### 4.1.4 Deployment & Monitoring
- Deploy rules/rulesets to repository
- Version control integration
- Real-time performance monitoring
- Alert on anomalies

---

## 5. Interface Requirements

### 5.1 CLI (Command Line Interface)
- **Target Users**: Engineers and power users
- **Features**:
  - Interactive chat mode
  - Command history
  - Pipeline execution
  - Scripting support

### 5.2 Web UI (Console & Dashboard)
- **Target Users**: Analysts and business users
- **Features**:
  - Visual conversation interface
  - Chart/table visualization
  - Rule editor with syntax highlighting
  - Workflow templates

---

## 6. Non-Functional Requirements

### 6.1 Reliability
- **Result Acceptance Rate**: Agent 生成结果的用户接受率 ≥ 80%
- **Task Completion Rate**: 任务完成率（不中断、不卡死）≥ 95%
- **Error Recovery**: 遇到错误时能够优雅降级或提示用户干预
- **Timeout Handling**: 长时间任务需要进度反馈，避免卡死假象
- **Operation Atomicity**: 操作原子性，部署操作要么全部成功要么全部回滚

### 6.2 Security
- Authentication & Authorization (Role-based access control)
- Audit logging (All operations logged)
- Data privacy (Sensitive data anonymization)
- No credential exposure in generated code

### 6.3 Explainability
- Show intermediate reasoning steps
- Provide data sources and confidence scores

### 6.4 Maintainability
- **Skills Support**: 支持用户自定义 Skills（参考 Claude Skills）

---


## 7. Constraints & Assumptions

### 7.1 Technical Constraints
- Must generate valid RDL syntax
- Cannot modify production data directly

### 7.2 Business Constraints
- Initial focus on credit risk 
- Must support Chinese and English
- Deployment requires human approval
