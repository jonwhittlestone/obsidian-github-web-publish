# CLAUDE.md

Project-specific instructions for Claude Code when working on this Obsidian plugin.

## Project Overview

This is an Obsidian plugin that enables publishing notes to a Jekyll blog on GitHub Pages via PR workflow.

**Design Document**: `/home/jon/Dropbox/DropsyncFiles/jw-mind/_www/26-obsidian-github-web-publish/design-document-obsidian-github-web-publish-main.md`

## Working Preferences

### Commit Guidelines

- **NEVER mention "Claude Code" or "Co-Authored-By: Claude" in commit messages**
- **Prefix commit messages with the current phase**
- Write clear, descriptive commit messages
- Keep commits focused and atomic

**Commit message format:**
```
<PHASE>: <Description>

<Optional body with details>
```

**Phase prefixes:**
- `MVP:` - Phase 1: Foundation
- `OAuth:` - Phase 2: OAuth & UX
- `Content:` - Phase 3: Content Processing
- `Polish:` - Phase 4: Multi-Site & Polish
- `Release:` - Phase 5: Release

**Examples:**
```
MVP: Project setup with TypeScript and Makefile
MVP: Add settings tab with GitHub token input
OAuth: Implement device flow authentication
Content: Add frontmatter validation
```

### Development Workflow

- **Pause after each task** to allow inspection of code/commits before proceeding
- Work through Phase tasks incrementally (see design document Section 19/21)
- Reference design document line numbers when discussing tasks

### Testing

- Run `make test` to execute unit tests
- All new functionality should have corresponding tests
- Tests should pass before committing

## Directory Structure

```
obsidian-github-web-publish/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings/            # Settings UI
│   ├── github/              # GitHub API integration
│   ├── publishing/          # File watching & publishing logic
│   ├── logging/             # Activity log
│   └── ui/                  # Modals, status bar, notices
├── tests/                   # Unit tests
├── Makefile                 # Build, test, lint commands
└── manifest.json            # Obsidian plugin manifest
```

## Key Technical Decisions

- Use `requestUrl()` from Obsidian API for all HTTP calls (bypasses CORS on mobile)
- Use `@octokit/core` with custom fetch wrapper (not `@octokit/rest`)
- Implement OAuth Device Flow manually (don't use `@octokit/auth-oauth-device`)
- Mobile compatible: `isDesktopOnly: false`

## Useful Commands

```bash
make dev      # Start development build with watch mode
make build    # Production build
make test     # Run unit tests
make lint     # Run linter
make clean    # Clean build artifacts
make help     # Show all available targets
```

## Test Vault

- Path: `/home/jon/code/playground/test-vault-for-obsidian-development`
- Plugin symlinked to: `.obsidian/plugins/obsidian-github-web-publish`
