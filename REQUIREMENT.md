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

### 4.2 Data Source Support

Agent 需要支持多种数据源，以便能够从不同系统中获取数据进行分析、特征工程和规则生成。支持的数据源类型包括关系型数据库、OLAP数据库、大数据平台、本地文件、API服务以及云数据平台。

#### 4.2.1 Relational Databases (关系型数据库)

**Supported Databases:**
- **PostgreSQL**: 支持 PostgreSQL 9.6+ 版本
- **MySQL**: 支持 MySQL 5.7+ 和 MySQL 8.0+ 版本
- **MariaDB**: 支持 MariaDB 10.3+ 版本（兼容 MySQL 协议）

**Capabilities:**
- Schema introspection: 自动发现表结构、字段类型、索引信息
- SQL query generation: 根据自然语言描述生成 SQL 查询
- Query execution: 执行 SELECT 查询，支持聚合、JOIN、子查询等复杂操作
- Connection pooling: 支持连接池管理，提高查询性能
- Transaction support: 支持事务操作（仅用于测试环境，生产环境只读）

**Use Cases:**
- 查询历史决策结果和交易数据
- 分析用户行为特征和模式
- 提取特征数据进行规则回测
- 关联查询多表数据进行分析

#### 4.2.2 OLAP Databases (OLAP数据库)

**Supported Databases:**
- **ClickHouse**: 支持 ClickHouse 20.3+ 版本

**Capabilities:**
- High-performance analytics: 支持大规模数据聚合分析
- Columnar query optimization: 针对列式存储优化查询
- Time-series analysis: 支持时间序列数据分析和窗口函数
- Distributed query support: 支持分布式集群查询
- Materialized view support: 支持物化视图查询

**Use Cases:**
- 分析大规模历史决策数据（百万级到亿级）
- 时间序列特征分析（如用户行为趋势）
- 实时指标计算和监控
- 多维度数据聚合和钻取分析
 

#### 4.2.3 Big Data Platforms (大数据平台)

**Supported Platforms:**
- **Apache Spark**: 支持 Spark 3.0+ 版本
  - PySpark integration: 支持 Python API 调用
  - Spark SQL: 支持 SQL 查询接口
  - DataFrame operations: 支持 DataFrame 操作和转换

**Capabilities:**
- Distributed data processing: 支持大规模分布式数据处理
- Spark SQL generation: 根据需求生成 Spark SQL 查询
- DataFrame operations: 支持复杂的数据转换和特征工程
- Cluster resource management: 支持 Spark cluster 资源管理
- Data source integration: 支持从 HDFS、S3、Hive 等读取数据

**Use Cases:**
- 处理超大规模数据集（TB 级别）
- 复杂特征工程和数据预处理
- 分布式特征计算和聚合
- 大规模规则回测和性能评估 

#### 4.2.4 Local Files (本地文件)

**Supported File Formats:**
- **Excel**: 支持 .xlsx, .xls 格式
  - Multiple sheet support: 支持多工作表读取
  - Data type inference: 自动推断数据类型
  - Header detection: 自动识别表头
- **CSV**: 支持 .csv 格式
  - Encoding detection: 自动检测文件编码（UTF-8, GBK, etc.）
  - Delimiter detection: 自动检测分隔符（逗号、制表符等）
  - Quote handling: 正确处理引号和转义字符
- **TXT**: 支持 .txt 格式
  - Line-by-line processing: 支持逐行处理
  - Custom delimiter support: 支持自定义分隔符

**Capabilities:**
- File upload: 支持通过 Web UI 或 CLI 上传文件
- Schema inference: 自动推断文件结构和数据类型
- Data preview: 支持数据预览（前 N 行）
- Chunked reading: 支持大文件分块读取
- Data validation: 数据格式验证和错误提示

**Use Cases:**
- 导入外部数据进行分析
- 上传测试数据进行规则验证
- 导入特征数据进行特征工程
- 导出分析结果到本地文件
 

#### 4.2.5 Service & API Integration (服务与API集成)

**Supported Protocols:**
- **REST API**: 支持 HTTP/HTTPS RESTful API 调用
- **GraphQL**: 支持 GraphQL 查询接口
- **gRPC**: 支持 gRPC 服务调用（可选）

**Capabilities:**
- API discovery: 支持 OpenAPI/Swagger 规范自动发现 API
- Request generation: 根据自然语言描述生成 API 请求
- Authentication: 支持多种认证方式（API Key, OAuth 2.0, Bearer Token）
- Response parsing: 自动解析 JSON/XML 响应
- Error handling: 优雅处理 API 错误和重试机制
- Rate limiting: 支持 API 速率限制和退避策略

**Use Cases:**
- 调用外部风控服务获取风险评分
- 查询第三方数据源（如征信数据、黑名单）
- 集成业务系统获取用户信息
- 调用特征服务获取实时特征值

#### 4.2.6 Cloud Data Platforms (云数据平台)

**Supported Platforms:**
- **Snowflake**: 支持 Snowflake 数据仓库
  - SQL query execution: 支持标准 SQL 查询
  - Warehouse management: 支持虚拟仓库管理
  - Schema discovery: 自动发现数据库和表结构
  - Data sharing: 支持数据共享功能
- **Databricks**: 支持 Databricks 平台
  - Databricks SQL: 支持 SQL 查询接口
  - Spark integration: 支持 Spark 作业执行
  - Delta Lake support: 支持 Delta Lake 表查询
  - Notebook execution: 支持 Databricks Notebook 执行（可选）

**Capabilities:**
- Cloud-native integration: 原生支持云数据平台特性
- Scalable query execution: 利用云平台弹性扩展能力
- Cost optimization: 查询成本优化建议
- Data governance: 支持数据治理和权限管理
- Multi-cloud support: 支持跨云平台数据访问

**Use Cases:**
- 查询云数据仓库中的历史数据
- 利用云平台计算资源进行大规模分析
- 跨平台数据整合和分析
- 利用云平台 ML 能力进行特征工程
 
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
