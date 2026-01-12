# CORINT Cognition

CORINT Risk Agent - AI-native assistant for risk management

## Project Structure

```
corint-cognition/
├── packages/
│   ├── agent-core/       # Core orchestration engine (LLM, planning, execution)
│   ├── agent-tools/      # Tool implementations (foundation, calculation, action)
│   ├── agent-skills/     # Skills registry and executor
│   └── agent-cli/        # CLI interface
├── docs/                 # Design documentation
│   ├── REQUIREMENT.md
│   ├── AGENT_DESIGN.md
│   └── TODO.md
└── package.json
```

## Phase 1 Status

✅ **Project Setup** (Completed)
- TypeScript monorepo with npm workspaces
- ESLint, Prettier, tsconfig configured
- Build pipeline with tsup
- Package structure created

✅ **LLM Integration** (Completed)
- LLM abstraction layer implemented
- OpenAI GPT-4 provider
- Anthropic Claude provider
- DeepSeek provider
- Streaming response handling
- Tool/function calling interface

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Development

```bash
npm run dev
```

## Packages

### @corint/agent-core
Core orchestration engine with LLM integration, tool registry, and type definitions.

### @corint/agent-tools
Tool implementations including foundation tools (SQL, file operations, API calls).

### @corint/agent-skills
Skills registry and executor for custom workflows.

### @corint/agent-cli
Command-line interface for interactive agent sessions.

## Next Steps (Phase 2)

- Implement Orchestrator (main agent loop)
- Implement Planning Module (task decomposition)
- Implement Execution Module (task manager, parallel executor)
- Implement Evaluation Module (result synthesis, confidence scoring)
- Add Context Manager and Cost Controller
