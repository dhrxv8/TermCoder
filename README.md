# TermCoder — Universal Terminal Coding Agent

A feature-complete terminal coding agent that replicates Claude Code's functionality with support for **all major AI providers**. Universal alternative to Claude Code with identical workflow and commands, plus multi-provider support.

[![npm version](https://badge.fury.io/js/termcode.svg)](https://badge.fury.io/js/termcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/dhrxv8/TermCoder)](https://github.com/dhrxv8/TermCoder/issues)
[![GitHub stars](https://img.shields.io/github/stars/dhrxv8/TermCoder)](https://github.com/dhrxv8/TermCoder/stargazers)

## 📖 Complete Usage Guide

**👉 [Read the Full Usage Guide](./USAGE_GUIDE.md)** for detailed installation, setup, and usage instructions.

## 📦 Latest Version: v0.2.2

**Recent Fixes:**
- ✅ Fixed embedding retrieval error (`TypeError: raw is not iterable`)
- ✅ Improved AI model prompt system for better diff generation
- ✅ Enhanced context handling for better responses
- ✅ Published to npm as `termcode@0.2.2`

## 🚀 Quick Start

```bash
# Install globally from npm
npm install -g termcode

# First run - launches onboarding wizard
termcode --repo .

# Choose providers (OpenAI, Anthropic, xAI, Google, Mistral, Cohere, Ollama)
# Add API keys (stored securely in OS keychain)  
# Configure tools and budget
# Start coding!
```

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
| **Multi-provider support** | ✅ | Switch between 7 AI providers in real-time |
| **Semantic code search** | ✅ | Embeddings + retrieval for large codebases |
| **Memory persistence** | ✅ | `TERMCODE.md` for project context and conventions |
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
| **Budget tracking** | ✅ | Monitor costs across providers with spending limits |
| **Health monitoring** | ✅ | Real-time provider status and connectivity checks |

## 💡 Basic Usage Examples

### Interactive Session
```bash
termcode --repo /path/to/your/project
[termcoder] > Add user authentication with JWT
[termcoder] > /provider anthropic
[termcoder] > Optimize the JWT validation logic
[termcoder] > test
[termcoder] > pr "Add JWT authentication system"
```

### One-shot Commands
```bash
# Quick single task
termcode "Migrate to TypeScript" --repo . --model gpt-4o

# Use different provider
termcode "Add dark mode toggle" --repo . --provider anthropic

# Dry run to preview changes
termcode "Add error handling" --repo . --dry
```

### Key Commands
```bash
# Provider Management
/provider <name>       # Switch between OpenAI, Anthropic, xAI, Google, Mistral, Cohere, Ollama
/model <model-id>      # Change model (gpt-4o, claude-3-5-sonnet, grok-beta, etc.)
/keys                  # Show API key status
/health                # Check provider connectivity
/whoami                # Current session info

# Git Workflow  
merge                  # Apply changes to main branch
rollback               # Discard all changes
pr "title"             # Create GitHub pull request

# Development Tools
test                   # Run project tests
lint                   # Run linter
build                  # Run build
!<command>             # Execute shell command safely

# Session Management
log                    # Show session history
/budget                # Usage and cost tracking
/sessions              # Recent project sessions
```

## 🔧 Installation Options

### Method 1: NPM (Recommended)
```bash
npm install -g termcode
```

### Method 2: From Source
```bash
git clone https://github.com/dhrxv8/TermCoder.git
cd TermCoder
npm install
npm run build
npm link
```

### Method 3: Download Binary
Download from [GitHub Releases](https://github.com/dhrxv8/TermCoder/releases)

## ⚙️ API Keys Setup

Get API keys from these providers:

- **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic**: [console.anthropic.com/account/keys](https://console.anthropic.com/account/keys)  
- **xAI**: [console.x.ai/team/api-keys](https://console.x.ai/team/api-keys)
- **Google**: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Mistral**: [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys/)
- **Cohere**: [dashboard.cohere.com/api-keys](https://dashboard.cohere.com/api-keys)
- **Ollama**: No API key needed - runs locally

Keys are stored securely in your OS keychain during the setup wizard.

## 🛡️ Safety Features

- **Branch isolation**: Every session works on a temporary branch
- **Clean state checks**: Won't start with uncommitted changes
- **Auto-commits**: Never lose work, every change is committed
- **3-way merge**: Handles conflicting patches gracefully
- **Constrained shell**: Only allows safe commands (npm, git, test runners)
- **Session logging**: Complete audit trail of all changes
- **Budget limits**: Spending controls across all providers

## 🔄 Workflow Comparison

| Action | Claude Code | TermCoder |
|--------|-------------|-----------|
| Start session | `claude --repo .` | `termcode --repo .` |
| Make changes | `> add auth` | `> add auth` |
| Switch provider | ❌ | `> /provider anthropic` |
| Switch model | ❌ | `> /model gpt-4o` |
| Run tests | `> test` | `> test` |
| Create PR | `> pr "title"` | `> pr "title"` |
| Rollback | `> rollback` | `> rollback` |
| Help | `> help` | `> help` |

**Identical workflow, but with multi-provider flexibility!**

## 🆚 Why TermCoder?

**Same Claude Code experience, but with:**
- **Multi-provider support** - Choose from 7 AI providers
- **Real-time switching** - Change providers mid-session
- **Local AI support** - Ollama for complete privacy
- **Cost optimization** - Use cheaper models for simple tasks
- **Budget tracking** - Monitor spending across providers
- **Health monitoring** - Real-time connectivity status
- **Identical commands** - Same workflow as Claude Code

Perfect for teams wanting Claude Code's proven workflow with the flexibility of multiple AI providers.

## 📚 Full Documentation

**For complete installation, setup, configuration, and usage instructions:**

**👉 [Read the Full Usage Guide](./USAGE_GUIDE.md)**

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Claude Code's excellent developer experience
- Built to provide multi-provider flexibility while maintaining workflow familiarity
- Thanks to all the AI providers for their APIs and model access

---

**TermCoder — Built with ❤️ as a Claude Code alternative**