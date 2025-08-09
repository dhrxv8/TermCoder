# Changelog

All notable changes to TermCoder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2025-08-09

### 🐛 Fixed
- **Critical**: Fixed `TypeError: raw is not iterable` in embedding retrieval system
- **Critical**: Fixed model diff generation by improving system prompts
- Enhanced context handling for better AI responses when no code context is found
- Fixed index format compatibility between old array format and new metadata format

### 🔧 Improved
- System prompts now provide explicit examples and requirements for diff generation
- User prompts handle empty context more gracefully
- Better error messages and fallback behavior in retrieval system

### 📦 Published
- Successfully published to npm as `termcode@0.2.2`
- All features now working correctly after initial deployment issues

## [0.2.1] - 2025-08-09

### 🐛 Fixed
- Fixed dependency issues with non-existent `ink-box@^3.0.0` package
- Corrected binary path from `./dist/index.js` to `dist/index.js`
- Added `files` field to package.json for proper package contents
- Made binary executable for global installation

### 🔄 Changed
- Removed problematic UI dependencies (`ink-*` packages) that were causing installation failures
- Streamlined package contents to include only essential files

### 📦 Published
- First working version successfully published to npm
- Users can now install with `npm install -g termcode`

## [0.2.0] - 2025-08-09

### 🚀 Added
- **Multi-provider AI support**: OpenAI, Anthropic, xAI, Google, Mistral, Cohere, Ollama
- **Interactive REPL**: Claude Code-style terminal session
- **One-shot commands**: Execute single tasks and exit
- **Real-time provider switching**: `/provider` and `/model` commands
- **Onboarding wizard**: First-run setup with secure key storage
- **Git workflow integration**: Auto-branching, commits, rollback, merge, PR creation
- **Development tools**: Built-in test, lint, build commands
- **Session management**: Persistent context and logging
- **Budget tracking**: Cost monitoring across providers
- **Health monitoring**: Real-time provider status checks
- **Semantic code search**: Embedding-based retrieval for large codebases
- **Memory persistence**: `TERMCODE.md` for project context
- **Safe shell access**: Constrained command execution

### 🎯 Features
- **7 AI Providers**: Complete multi-provider architecture
- **Secure API Key Storage**: OS keychain integration
- **Advanced Git Integration**: Branch isolation and clean workflows
- **Project Type Detection**: Automatic test/lint/build tool detection
- **Configuration Management**: JSON-based settings with validation
- **Usage Analytics**: Token and cost tracking
- **Error Handling**: Comprehensive error recovery and logging

### 📦 Initial Release
- ⚠️ Had dependency and binary permission issues (fixed in 0.2.1)
- Published as `termcode@0.2.0` but installation failed

## [Preview] - 2025-08-08

### 🎉 Preview Release
- Complete TermCoder implementation with all Phase 1-7 features
- Tagged as "TermCoder-Preview" on GitHub
- All core functionality implemented and tested
- Documentation and usage guides created

---

## Version History Summary

| Version | Date | Status | Key Changes |
|---------|------|--------|-------------|
| **0.2.2** | 2025-08-09 | ✅ **Stable** | **Recommended** - Fixed critical bugs, fully functional |
| 0.2.1 | 2025-08-09 | ✅ Working | Fixed installation issues, first working npm release |
| 0.2.0 | 2025-08-09 | ❌ Broken | Initial npm release with dependency issues |
| Preview | 2025-08-08 | ✅ Working | GitHub-only preview release |

## Installation

**Current stable version:**
```bash
npm install -g termcode@0.2.2
```

## Links

- **npm Package**: https://www.npmjs.com/package/termcode
- **GitHub Repository**: https://github.com/dhrxv8/TermCoder
- **Usage Guide**: [USAGE_GUIDE.md](./USAGE_GUIDE.md)
- **Issues**: https://github.com/dhrxv8/TermCoder/issues