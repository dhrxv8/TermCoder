# TermCoder Usage Guide

## Table of Contents
- [Quick Start](#quick-start)
- [Installation](#installation)
- [First-Time Setup](#first-time-setup)
- [Basic Usage](#basic-usage)
- [Command Reference](#command-reference)
- [Multi-Provider Support](#multi-provider-support)
- [Advanced Features](#advanced-features)
- [Development Workflow](#development-workflow)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

**Install and run in 3 commands:**
```bash
npm install -g termcode@0.2.2
termcode --repo /path/to/your/project
# Follow the setup wizard, then start coding with AI!
```

> **Latest Version**: v0.2.2 - Includes fixes for embedding retrieval errors and improved AI response generation.

---

## Installation

### Method 1: NPM (Recommended)
```bash
npm install -g termcode@0.2.2
```

### Method 2: From Source
```bash
git clone https://github.com/dhrxv8/TermCoder.git
cd TermCoder
npm install
npm run build
npm link
```

### Method 3: Direct Download
Download the latest release from [GitHub Releases](https://github.com/dhrxv8/TermCoder/releases)

---

## First-Time Setup

When you run TermCoder for the first time, it will guide you through setup:

```bash
termcode --repo .
```

### Setup Wizard Steps:

1. **Select AI Providers** - Choose from:
   - **OpenAI** (GPT-4, ChatGPT) - Get key at [platform.openai.com](https://platform.openai.com/api-keys)
   - **Anthropic** (Claude) - Get key at [console.anthropic.com](https://console.anthropic.com/account/keys)
   - **xAI** (Grok) - Get key at [console.x.ai](https://console.x.ai/team/api-keys)
   - **Google** (Gemini) - Get key at [aistudio.google.com](https://aistudio.google.com/app/apikey)
   - **Mistral AI** - Get key at [console.mistral.ai](https://console.mistral.ai/api-keys/)
   - **Cohere** - Get key at [dashboard.cohere.com](https://dashboard.cohere.com/api-keys)
   - **Ollama** (Local) - No key needed, runs locally

2. **API Keys** - Securely stored in your OS keychain
3. **Default Provider** - Choose your preferred AI provider
4. **Tools Configuration** - Enable shell, git, tests, browser automation
5. **Budget Settings** - Set monthly spending limits

---

## Basic Usage

### One-Shot Commands
Execute a single task and exit:
```bash
termcode "Add user authentication" --repo .
termcode "Fix the login bug" --repo /path/to/project
termcode "Refactor the database layer" --repo . --provider anthropic
```

### Interactive Mode
Start an interactive coding session:
```bash
termcode --repo .
```

Once in interactive mode:
```
termcode > Add a dark mode toggle to the settings
termcode > Fix all TypeScript errors
termcode > Write unit tests for the auth module
termcode > help
```

### Full-Screen TUI (Coming Soon)
```bash
termcode --repo . --ui
```

---

## Command Reference

### General Commands
| Command | Description |
|---------|-------------|
| `<task>` | Execute any coding task |
| `help` | Show all available commands |
| `exit` / `quit` | Exit TermCoder |

### Provider Management
| Command | Description | Example |
|---------|-------------|---------|
| `/provider <name>` | Switch AI provider | `/provider anthropic` |
| `/model <name>` | Change model | `/model gpt-4o` |
| `/keys` | Show API key status | |
| `/health` | Check provider connectivity | |
| `/whoami` | Show current session info | |

### Git Workflow
| Command | Description |
|---------|-------------|
| `merge` | Merge changes to main branch |
| `rollback` | Discard all changes |
| `pr "Title"` | Create GitHub pull request |

### Development Tools
| Command | Description |
|---------|-------------|
| `test` | Run project tests |
| `lint` | Run code linter |
| `build` | Build the project |
| `!<command>` | Execute shell command |

### Session Management
| Command | Description |
|---------|-------------|
| `log` | Show session history |
| `clear-log` | Clear session logs |
| `/budget` | Show usage and costs |
| `/sessions` | Show recent sessions |
| `/config` | Configuration commands |

---

## Multi-Provider Support

### Available Providers

#### Cloud Providers
- **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo`
- **Anthropic**: `claude-3-5-sonnet`, `claude-3-5-haiku`
- **xAI**: `grok-beta`, `grok-vision-beta`
- **Google**: `gemini-1.5-pro`, `gemini-1.5-flash`
- **Mistral**: `mistral-large`, `mistral-medium`, `codestral`
- **Cohere**: `command-r-plus`, `command-r`

#### Local Provider
- **Ollama**: `llama3.1:8b`, `llama3.1:70b`, `codellama:7b`

### Switching Providers
```bash
# During session
termcode > /provider anthropic
termcode > /model claude-3-5-sonnet

# Via command line
termcode --repo . --provider openai --model gpt-4o
```

### Provider Health Check
```bash
termcode > /health
```
Shows connectivity, latency, and available models for each provider.

---

## Advanced Features

### 1. Dry Run Mode
Preview changes without applying them:
```bash
termcode "Refactor user service" --repo . --dry
```

### 2. Budget Management
Set spending limits and track usage:
```bash
termcode > /budget
termcode > /config budget 50  # Set $50 monthly limit
```

### 3. Session Persistence
TermCoder remembers your:
- Recent tasks and changes
- Provider preferences
- Project context
- Usage statistics

### 4. Smart Context Retrieval
TermCoder automatically:
- Indexes your codebase
- Retrieves relevant code for tasks
- Maintains project memory in `TERMCODE.md`

### 5. Multi-Repository Support
Switch between projects seamlessly:
```bash
termcode --repo /path/to/project1
termcode --repo /path/to/project2
```

### 6. Offline Mode (Ollama)
Use local AI models for complete privacy:
```bash
# Install Ollama first
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.1:8b

# Use with TermCoder
termcode > /provider ollama
```

---

## Development Workflow

### Typical Workflow
1. **Start Session**
   ```bash
   termcode --repo .
   ```

2. **Work on Features**
   ```bash
   termcode > Add user registration with email validation
   termcode > Write tests for the registration feature
   termcode > Fix any failing tests
   ```

3. **Quality Checks**
   ```bash
   termcode > test
   termcode > lint
   termcode > build
   ```

4. **Review Changes**
   ```bash
   termcode > log  # See what was done
   ```

5. **Create Pull Request**
   ```bash
   termcode > pr "Add user registration feature"
   ```

### Git Integration
TermCoder automatically:
- Creates feature branches
- Commits changes with descriptive messages
- Manages clean git workflow
- Integrates with GitHub

### Project Types Supported
- **JavaScript/TypeScript** (React, Node.js, Vue, Angular)
- **Python** (Django, Flask, FastAPI)
- **Go** projects
- **Rust** projects
- **Java** (Maven, Gradle)
- And more...

---

## Configuration

### Config File Location
- **macOS**: `~/.termcode/config.json`
- **Linux**: `~/.termcode/config.json`
- **Windows**: `%USERPROFILE%\.termcode\config.json`

### View/Edit Configuration
```bash
termcode > /config path     # Show config file location
termcode > /config edit     # Open in editor
termcode > /config validate # Validate configuration
termcode > /config reset    # Reset to defaults
```

### Example Configuration
```json
{
  "defaultProvider": "openai",
  "models": {
    "openai": {
      "chat": "gpt-4o-mini",
      "embed": "text-embedding-3-small"
    },
    "anthropic": {
      "chat": "claude-3-5-sonnet"
    }
  },
  "tools": {
    "shell": true,
    "git": true,
    "tests": "auto",
    "browser": false
  },
  "routing": {
    "fallback": ["openai"],
    "budgetUSDMonthly": 10
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. "No API key configured"
```bash
termcode > /keys  # Check key status
termcode > /provider openai  # Add missing key
```

#### 2. "Repository is not clean"
```bash
git add .
git commit -m "Save current work"
# Or use git stash
```

#### 3. "Provider health check failed"
```bash
termcode > /health  # Check connectivity
# Verify API keys and internet connection
```

#### 4. "Command not allowed"
Some shell commands are restricted for security:
```bash
# Instead of dangerous commands, use TermCoder's built-in tools
termcode > test      # Instead of direct test commands
termcode > build     # Instead of direct build commands
```

#### 5. Ollama not working
```bash
# Make sure Ollama is running
ollama serve

# Pull required models
ollama pull llama3.1:8b
```

### Debug Mode
Set environment variable for detailed logs:
```bash
export DEBUG=1
termcode --repo .
```

### Getting Help
- **GitHub Issues**: [Report bugs](https://github.com/dhrxv8/TermCoder/issues)
- **Documentation**: [Full docs](https://github.com/dhrxv8/TermCoder#readme)
- **Discussions**: [Community help](https://github.com/dhrxv8/TermCoder/discussions)

---

## Tips & Best Practices

### 1. Be Specific in Requests
❌ **Vague**: "Fix the code"
✅ **Clear**: "Fix the TypeScript error in UserService.authenticate method"

### 2. Use Context
❌ **No context**: "Add validation"
✅ **With context**: "Add email validation to the user registration form"

### 3. Incremental Changes
- Work in small, focused tasks
- Test after each change
- Use `log` to track progress

### 4. Provider Selection
- **GPT-4o**: Best for complex reasoning
- **Claude**: Great for code analysis
- **Grok**: Good for creative solutions
- **Ollama**: Best for privacy/offline use

### 5. Budget Management
- Set realistic monthly budgets
- Monitor usage with `/budget`
- Use cheaper models for simple tasks

---

## CLI Options Reference

```bash
termcode [task] --repo <path> [options]

Options:
  --repo, -r        Repository path (required)
  --dry, -d         Preview changes without applying
  --model, -m       Override model (gpt-4o, claude-3-5-sonnet, etc.)
  --provider, -p    Override provider (openai, anthropic, etc.)
  --ui, -u          Launch full-screen TUI interface
  --help            Show help
  --version         Show version

Examples:
  termcode --repo .
  termcode "Add auth" --repo . --provider anthropic
  termcode --repo . --model gpt-4o --dry
  termcode --repo . --ui
```

---

**🚀 You're ready to start coding with AI! Run `termcode --repo .` in any project directory to begin.**