# TermCoder — Superior Terminal AI Coding Agent

**Next-generation terminal coding agent with advanced architecture and enterprise-grade features**

[![npm version](https://badge.fury.io/js/termcode.svg)](https://badge.fury.io/js/termcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/dhrxv8/TermCoder)](https://github.com/dhrxv8/TermCoder/stargazers)

## 🚀 Quick Start

```bash
npm install -g termcode
termcode --repo .
# Interactive setup wizard will configure your AI providers
```

## 🎯 Why TermCoder Over Claude Code?

| Feature | Claude Code | TermCoder |
|---------|-------------|-----------|
| **AI Providers** | Anthropic only | 7+ providers (OpenAI, Anthropic, xAI, Google, Mistral, Cohere, Ollama) |
| **Security** | Basic validation | Advanced security sandbox with 30+ rules |
| **Intelligence** | Static | AI-powered error recovery & smart suggestions |
| **Performance** | No monitoring | Real-time performance analytics & optimization |
| **Extensibility** | Limited | Full plugin system with marketplace |
| **Workflow** | Basic diffs | Enhanced diff management with conflict resolution |

## 🏗️ Advanced Architecture

### 🛡️ **Enterprise Security**
- **Multi-layered sandbox** with dynamic policy enforcement
- **AI-powered anomaly detection** for suspicious commands
- **Security rule engine** with 30+ built-in security patterns
- **Command validation** with whitelist/blacklist management

### 🧠 **Intelligent Systems**
- **Smart error recovery** with 15+ error pattern recognition
- **AI-powered suggestions** with context awareness and learning
- **Performance monitoring** with real-time metrics and optimization
- **Hook system** for pre/post execution validation and customization

### 🔌 **Extensible Platform**
- **Plugin system** with lifecycle management and dependency resolution
- **Marketplace integration** for community extensions
- **Hook architecture** for custom workflow integration
- **MCP support** for external data source connectivity

## 🤖 Multi-Provider AI Support

| Provider | Models | Status |
|----------|---------|---------|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-turbo | ✅ Full support |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus/Sonnet | ✅ Full support |
| **xAI** | Grok Beta, Grok Vision | ✅ Full support |
| **Google** | Gemini 1.5 Pro/Flash, Gemini 1.0 Pro | ✅ Full support |
| **Mistral** | Mistral Large/Medium, Codestral | ✅ Full support |
| **Cohere** | Command R/R+, Command | ✅ Full support |
| **Ollama** | Any local model (Llama, CodeLlama, etc.) | ✅ Full support |

## ⚡ Core Features

### **Smart Terminal Experience**
```bash
termcode --repo .
[termcoder] > Add user authentication with JWT tokens
[termcoder] > /provider anthropic    # Switch to Claude
[termcoder] > /performance          # View performance metrics
[termcoder] > test && build         # Run tests and build
[termcoder] > pr "Add JWT auth"     # Create pull request
```

### **Advanced Command System**
- **Smart suggestions** with AI-powered autocomplete
- **Context awareness** with project type detection
- **Pattern learning** from user behavior
- **Intelligent recovery** from errors and failures

### **Enhanced Workflow Management**
- **Branch isolation** with automatic git branch creation
- **Conflict resolution** with 3-way merge capabilities  
- **Session persistence** with complete audit trails
- **Rollback system** for safe experimentation

## 🎮 Interactive Commands

### **Provider Management**
```bash
/provider <name>       # Switch AI provider
/model <id>           # Change model
/health               # Check provider status
/keys                 # API key management
```

### **Advanced Features**
```bash
/performance          # Performance analytics & optimization
/security             # Security sandbox statistics
/intelligence         # AI error recovery stats
/hooks               # Active system hooks
/plugins             # Plugin system management
/suggestions         # Smart suggestion analytics
/diffs               # Diff management status
/workspace           # Workspace information
```

### **Development Tools**
```bash
test                 # Auto-detect and run tests
lint                 # Run project linter
build                # Run project build
!<command>           # Safe shell execution
```

### **Git Workflow**
```bash
merge                # Apply changes to main
rollback             # Discard all changes  
pr "title"           # Create GitHub PR
status               # Git status
```

## 🔧 Installation & Setup

### **Method 1: NPM (Recommended)**
```bash
npm install -g termcode
termcode --repo /path/to/project
```

### **Method 2: From Source**
```bash
git clone https://github.com/dhrxv8/TermCoder.git
cd TermCoder
npm install && npm run build && npm link
```

### **API Key Setup**
Get your API keys from:
- [OpenAI](https://platform.openai.com/api-keys)
- [Anthropic](https://console.anthropic.com/account/keys)
- [xAI](https://console.x.ai/team/api-keys)
- [Google](https://aistudio.google.com/app/apikey)
- [Mistral](https://console.mistral.ai/api-keys/)
- [Cohere](https://dashboard.cohere.com/api-keys)
- Ollama: No API key needed (local)

Keys are stored securely in OS keychain during setup.

## 📊 Advanced Capabilities

### **Performance Intelligence**
- Real-time AI call monitoring with latency tracking
- Resource usage analysis and optimization suggestions
- Provider performance comparison and recommendations
- Automated performance alerts and thresholds

### **Security Architecture**
- Dynamic command validation with security policies
- Credential leak detection and prevention
- Suspicious pattern recognition with AI analysis
- Compliance reporting and audit trails

### **Smart Workflow**
- Context-aware task suggestions based on project type
- Intelligent conflict resolution for merge operations
- Automated error recovery with suggested fixes
- Learning system that improves with usage patterns

## 🛡️ Enterprise-Grade Safety

- **Isolated execution** with temporary git branches
- **Clean state validation** prevents data loss
- **Auto-commit system** with descriptive messages
- **Rollback capabilities** for safe experimentation
- **Budget controls** across all AI providers
- **Audit logging** for compliance requirements

## 📈 Performance & Monitoring

TermCoder provides comprehensive monitoring and analytics:

- **Response time tracking** across all AI providers
- **Cost optimization** suggestions based on usage patterns  
- **Error rate monitoring** with intelligent recovery
- **Resource utilization** analysis and recommendations
- **Provider health checks** with automatic failover

## 🔌 Plugin Ecosystem

Extend TermCoder with plugins:

```bash
/plugins                    # View installed plugins
termcode plugin install git-enhanced    # Install plugin
termcode plugin search security        # Search marketplace
```

Built-in plugin types:
- **Security scanners** for vulnerability detection
- **Code analyzers** for quality metrics
- **Workflow integrations** for CI/CD systems
- **AI provider extensions** for custom models

## 🚀 Advanced Usage Examples

### **Multi-Provider Workflow**
```bash
termcode --repo .
[termcoder] > /provider openai
[termcoder] > Add React components    # Fast with GPT-4o
[termcoder] > /provider anthropic  
[termcoder] > Review code quality     # Thorough with Claude
[termcoder] > /provider ollama
[termcoder] > Add tests              # Private with local model
```

### **Performance Optimization**
```bash
[termcoder] > /performance
⚡ Performance Statistics:
  Total Metrics: 847
  Avg Response Time: 2,341ms  
  Success Rate: 94.2%
  
  Recommendations:
    HIGH Switch from slow provider
    MED  Consider using faster model
```

### **Security Monitoring**
```bash
[termcoder] > /security  
🛡️ Security Statistics:
  Total Violations: 12
  By Severity:
    critical: 0
    high: 2
    medium: 5
    low: 5
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built as a superior alternative to Claude Code
- Inspired by the need for multi-provider flexibility
- Thanks to the AI community for feedback and contributions

---

**TermCoder — Where AI meets Terminal Excellence** 🚀

*Built with advanced architecture for developers who demand more*