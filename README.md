# TermCoder — Universal Terminal Coding Agent

A feature-complete terminal coding agent that replicates Claude Code's functionality with support for **all major AI providers**. Universal alternative to Claude Code with identical workflow and commands, plus multi-provider support.

[![npm version](https://badge.fury.io/js/termcoder.svg)](https://badge.fury.io/js/termcoder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/dhrxv8/TermCoder)](https://github.com/dhrxv8/TermCoder/issues)
[![GitHub stars](https://img.shields.io/github/stars/dhrxv8/TermCoder)](https://github.com/dhrxv8/TermCoder/stargazers)

## 🤖 Supported Providers

| Provider | Models | Embeddings | Status |
|----------|---------|------------|---------|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo | ✅ text-embedding-3-* | ✅ Full support |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku | ➡️ Fallback to OpenAI | ✅ Full support |
| **xAI** | Grok Beta, Grok Vision | ➡️ Fallback to OpenAI | ✅ Full support |
| **Google** | Gemini 1.5 Pro/Flash, Gemini 1.0 Pro | ✅ text-embedding-004 | ✅ Full support |
| **Mistral** | Mistral Large/Medium/Small, Codestral | ✅ mistral-embed | ✅ Full support |
| **Cohere** | Command R/R+, Command | ✅ embed-english/multilingual-v3.0 | ✅ Full support |
| **Ollama** | Any local model (Llama, CodeLlama, etc.) | ✅ mxbai-embed-large, nomic-embed-text | ✅ Full support |

## 🎯 Complete Feature Set

| Feature | Status | Description |
|---------|---------|-------------|
| **Interactive REPL** | ✅ | Claude-style terminal session with persistent context |
| **One-shot commands** | ✅ | Single task execution and exit |
| **Semantic code search** | ✅ | Embeddings + retrieval for large codebases |
| **Memory persistence** | ✅ | `TERMCODE.md` for project context and conventions |
| **Multi-provider support** | ✅ | Switch between OpenAI, Anthropic, xAI, Google, Mistral, Cohere, Ollama |
| **Onboarding wizard** | ✅ | First-run setup with provider selection and secure key storage |
| **Real-time switching** | ✅ | `/provider` and `/model` commands in REPL |
| **Multi-file diffs** | ✅ | Unified diff editing with 3-way merge fallback |
| **Auto-branching** | ✅ | Each session gets isolated git branch |
| **Auto-commit** | ✅ | Every change committed with descriptive messages |
| **Instant rollback** | ✅ | `rollback` command to discard all session changes |
| **Branch merging** | ✅ | `merge` command to apply changes to main |
| **GitHub PR creation** | ✅ | `pr "title"` creates pull request with session summary |
| **Test runner** | ✅ | `test` command runs project tests (npm/pytest/go/cargo) |
| **Linting** | ✅ | `lint` command runs ESLint/Ruff/etc. |
| **Build validation** | ✅ | `build` command runs project build |
| **Session logging** | ✅ | Complete transcript of all changes with timestamps |
| **Safe shell access** | ✅ | `!command` for constrained shell execution |
| **Model selection** | ✅ | `--model` flag for gpt-4o/gpt-4o-mini/etc. |

## 🚀 Quick Start

```bash
# Install globally from npm
npm install -g termcoder

# First run - launches onboarding wizard
termcoder --repo ~/your-project

# Choose providers (OpenAI, Anthropic, xAI, Google, Mistral, Cohere, Ollama)
# Add API keys (stored securely in OS keychain)  
# Configure tools and budget
# Start coding!
```

**That's it!** No manual configuration files or environment variables needed.

## 🚀 Development Installation

```bash
# Clone and build from source
git clone https://github.com/dhrxv8/TermCoder.git
cd TermCoder
npm install
npm run build
npm link  # Makes 'termcoder' available globally

# No .env file needed - onboarding wizard handles everything
```

## 💡 Usage

### Interactive Session (Claude Code style)
```bash
termcoder --repo /path/to/your/project
[info] Using openai (gpt-4o-mini)
[info] Loading repo: /path/to/your/project
[info] Working on branch: termcode-1754624890
[info] Index ready. Memory loaded.

[termcoder] > Add user authentication with JWT
[info] Applied: src/auth.ts, middleware/auth.js
[info] Changes committed

[termcoder] > /provider anthropic
[info] Provider → anthropic (claude-3-5-sonnet-20241022)

[termcoder] > Optimize the JWT validation logic
[info] Applied: middleware/auth.js
[info] Changes committed

[termcoder] > test
[info] ✅ Tests passed

[termcoder] > pr "Add JWT authentication system"
[info] ✅ Created PR: https://github.com/user/repo/pull/42

[termcoder] > rollback  # or 'merge' to keep changes
[info] Rollback complete. Switched back to main.
```

### One-shot Commands
```bash
# Quick single task
termcoder "Migrate to TypeScript" --repo . --model gpt-4o

# Use different provider
termcoder "Add dark mode toggle" --repo . --provider anthropic

# Dry run to preview changes
termcoder "Add error handling" --repo . --dry
```

### Available REPL Commands
```bash
# Coding Tasks
<task description>     # Execute any coding task
help                   # Show command reference

# Provider & Model Management
/provider <name>       # Switch provider (openai, anthropic, xai, google, mistral, cohere, ollama)
/model <model-id>      # Switch model (gpt-4o, claude-3-5-sonnet, grok-beta, etc.)
/keys                  # Show API key status for all providers
/whoami                # Show current provider, model, and session info

# Git Workflow  
rollback              # Discard all changes, return to main
merge                 # Merge changes to main branch
pr "title"            # Create GitHub pull request

# Development
test                  # Run project tests
lint                  # Run linter
build                 # Run build
!<command>            # Execute shell command safely

# Session Management
log                   # Show session history
clear-log             # Clear all session logs
exit/quit             # End session
```

## 🔧 Configuration

### Environment Variables (.env)
```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini                    # Default model
EMBED_MODEL=text-embedding-3-small         # For semantic search
GITHUB_TOKEN=your_github_token              # For PR creation
SHELL_TIMEOUT_MS=300000                     # Shell command timeout
```

### Memory File (TERMCODE.md)
Auto-created in your repo root. Edit to provide context:

```markdown
# TermCode Memory

## Project Goals  
- Build a React dashboard with TypeScript
- Focus on performance and accessibility

## Style & Conventions
- Use functional components with hooks
- ESLint + Prettier configuration
- Test with Jest and React Testing Library

## Domain Knowledge
- Users have roles: admin, manager, viewer
- API follows REST conventions with JWT auth
```

## 🛡️ Safety Features

- **Branch isolation**: Every session works on a temporary branch
- **Clean state checks**: Won't start with uncommitted changes
- **Auto-commits**: Never lose work, every change is committed
- **3-way merge**: Handles conflicting patches gracefully
- **Constrained shell**: Only allows safe commands (npm, git, test runners)
- **Session logging**: Complete audit trail of all changes

## 🔄 Workflow Comparison

| Action | Claude Code | TermCoder |
|--------|-------------|-----------|
| Start session | `claude --repo .` | `termcoder --repo .` |
| Make changes | `> add auth` | `> add auth` |
| Switch provider | ❌ | `> /provider anthropic` |
| Switch model | ❌ | `> /model gpt-4o` |
| Run tests | `> test` | `> test` |
| Create PR | `> pr "title"` | `> pr "title"` |
| Rollback | `> rollback` | `> rollback` |
| Help | `> help` | `> help` |

**Identical workflow, but with multi-provider flexibility!**

## ⚙️ Configuration

TermCoder stores configuration in `~/.termcoder/config.json` and API keys securely in your OS keychain.

### API Keys Setup

Get API keys from these providers:
- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/account/keys  
- **xAI**: https://console.x.ai/team/api-keys
- **Google**: https://aistudio.google.com/app/apikey
- **Mistral**: https://console.mistral.ai/api-keys/
- **Cohere**: https://dashboard.cohere.com/api-keys
- **Ollama**: No API key needed - runs locally

### Configuration Management
```bash
# View current configuration
termcoder /whoami

# Check API key status  
termcoder /keys

# Add/update API keys interactively
termcoder /provider <provider-name>

# Edit config file directly
open ~/.termcoder/config.json
```

## 🎛️ Advanced Usage

### Custom Models
```bash
termcode --model gpt-4o --repo .           # Use GPT-4o 
termcode --model gpt-4o-mini --repo .      # Use GPT-4o Mini (faster/cheaper)
```

### Session Transcripts
All changes are logged to `.termcode-logs/` with full context:
```
TIMESTAMP: 2025-01-08T10:30:00.000Z
BRANCH: termcode-1754624890
MODEL: gpt-4o-mini
TASK: Add user authentication
APPLIED: src/auth.ts, middleware/auth.js
```

### GitHub Integration
Set `GITHUB_TOKEN` to enable:
- `pr "title"` creates pull requests
- Auto-generates PR body from session history
- Links back to TermCode for attribution

## 🆚 Why TermCode?

**Same Claude Code experience, but with:**
- ChatGPT models (GPT-4o, GPT-4o-mini) 
- Potentially lower costs
- OpenAI API ecosystem compatibility
- Identical commands and workflow

Perfect for teams already using OpenAI APIs or preferring ChatGPT models while keeping the proven Claude Code UX.

---

**TermCode — Built with ❤️ as a Claude Code alternative**