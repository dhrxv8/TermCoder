# TermCoder Release Process

This document outlines the systematic process for releasing new versions of TermCoder to ensure consistency between npm packages, GitHub releases, and documentation.

## 🔄 Complete Release Checklist

### Phase 1: Pre-Release Preparation

- [ ] **Test all changes locally**
  ```bash
  npm run build
  chmod +x dist/index.js
  ./dist/index.js --help  # Verify it works
  ```

- [ ] **Update version in package.json**
  ```bash
  # Bump version (patch: 0.0.X, minor: 0.X.0, major: X.0.0)
  # Edit package.json manually or use npm version
  npm version patch  # or minor/major
  ```

- [ ] **Update all documentation**
  - [ ] README.md - Update latest version section
  - [ ] USAGE_GUIDE.md - Update installation commands
  - [ ] CHANGELOG.md - Add new version entry with changes

### Phase 2: Build and Test

- [ ] **Clean build**
  ```bash
  npm run build
  chmod +x dist/index.js
  ```

- [ ] **Test locally**
  ```bash
  # Test basic functionality
  ./dist/index.js --version
  ./dist/index.js --help
  ```

- [ ] **Test on clean repository**
  ```bash
  # Create test project
  mkdir /tmp/test-termcode
  cd /tmp/test-termcode
  git init
  echo "console.log('test');" > test.js
  git add . && git commit -m "test"
  
  # Test termcode
  /path/to/termcode/dist/index.js --repo . --dry "improve this code"
  ```

### Phase 3: Publication

- [ ] **Publish to npm**
  ```bash
  npm login  # If not already logged in
  npm publish
  ```

- [ ] **Verify npm publication**
  ```bash
  npm view termcode  # Check latest version
  npm install -g termcode@$(node -p "require('./package.json').version")
  termcode --version
  ```

### Phase 4: GitHub Release

- [ ] **Commit all changes**
  ```bash
  git add -A
  git commit -m "release: Version X.X.X

  - Summary of changes
  - Key fixes or features
  - Breaking changes (if any)"
  ```

- [ ] **Create and push Git tag**
  ```bash
  VERSION=$(node -p "require('./package.json').version")
  git tag -a "v$VERSION" -m "TermCoder v$VERSION

  📝 Changes:
  - List key changes here
  - Fix descriptions
  - New features

  📦 Installation:
  npm install -g termcode@$VERSION"
  
  git push origin main
  git push origin "v$VERSION"
  ```

- [ ] **Create GitHub Release** (via GitHub UI)
  - Go to https://github.com/dhrxv8/TermCoder/releases
  - Click "Create a new release"
  - Select the tag you just created
  - Copy release notes from CHANGELOG.md
  - Mark as latest release

### Phase 5: Documentation Sync

- [ ] **Update README.md badges and version info**
- [ ] **Update USAGE_GUIDE.md with new version**
- [ ] **Update any version-specific documentation**
- [ ] **Verify all links work**

### Phase 6: Post-Release

- [ ] **Test fresh installation**
  ```bash
  npm uninstall -g termcode
  npm install -g termcode
  termcode --version  # Should show new version
  ```

- [ ] **Monitor for issues**
  - Check GitHub issues
  - Monitor npm download stats
  - Watch for user feedback

- [ ] **Announce if major release**
  - Social media
  - Developer communities
  - Update relevant documentation sites

## 🚨 Emergency Hotfix Process

For critical bugs that need immediate fixing:

1. **Create hotfix branch**
   ```bash
   git checkout -b hotfix/urgent-fix
   ```

2. **Make minimal fix**
3. **Bump patch version**
4. **Fast-track through release process**
5. **Skip lengthy testing for critical security/functionality fixes**

## 📋 Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.X.0): New features, backward compatible
- **PATCH** (0.0.X): Bug fixes, backward compatible

Examples:
- Bug fix: 0.2.2 → 0.2.3
- New feature: 0.2.2 → 0.3.0  
- Breaking change: 0.2.2 → 1.0.0

## 🎯 Release Templates

### CHANGELOG.md Entry Template
```markdown
## [X.X.X] - YYYY-MM-DD

### 🚀 Added
- New features

### 🔧 Changed  
- Modified functionality

### 🐛 Fixed
- Bug fixes

### 📦 Published
- npm publication notes
```

### Git Tag Template
```
TermCoder vX.X.X - Release Name

📝 Changes:
- Key change 1
- Key change 2

🐛 Fixes:
- Bug fix 1
- Bug fix 2

📦 Installation:
npm install -g termcode@X.X.X
```

## ✅ Current State

As of August 9, 2025:
- **Latest Version**: 0.2.2
- **npm Package**: `termcode@0.2.2`
- **GitHub Tags**: `v0.2.2`, `v0.2.1`, `TermCoder-Preview`
- **Status**: All systems in sync ✅

## 🔗 Quick Links

- **npm Package**: https://www.npmjs.com/package/termcode
- **GitHub Releases**: https://github.com/dhrxv8/TermCoder/releases
- **Issues**: https://github.com/dhrxv8/TermCoder/issues
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)