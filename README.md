# GitHub Web Publish

An Obsidian plugin for publishing notes to Jekyll/GitHub Pages via PR workflow.

## Features

- **Directory-based publishing**: Move files between folders to trigger publish actions
- **Multi-site support**: Publish to multiple Jekyll blogs from one vault
- **Scheduled publishing**: Queue posts for automatic merge via GitHub Actions
- **Immediate publishing**: Merge PRs instantly when needed
- **Update workflow**: Republish existing posts with updates
- **Unpublish/Withdraw**: Remove posts or cancel pending PRs
- **Asset handling**: Automatically upload images referenced in posts
- **Frontmatter validation**: Validate posts before publishing
- **Activity logging**: Track all publish operations in a markdown log
- **Mobile compatible**: Works on iOS and Android (no git required)

## Installation

### From Community Plugins (Coming Soon)

1. Open Obsidian Settings → Community plugins
2. Search for "GitHub Web Publish"
3. Install and enable

### Manual Installation

1. Download the latest release
2. Extract to `.obsidian/plugins/obsidian-github-web-publish/`
3. Enable in Settings → Community plugins

## Quick Start

1. **Authenticate**: Settings → GitHub Web Publish → Login with GitHub
2. **Add a site**: Click "Add Site" and configure your Jekyll repository
3. **Create folders**: Use "Create Folders" button to set up the directory structure
4. **Write & publish**: Create posts in `unpublished/`, then move to publish

## Directory Structure

Each configured site uses this folder structure:

```
_www/sites/<your-site>/
├── unpublished/              # Draft posts
├── ready-to-publish-scheduled/  # Queue for scheduled publish (via GitHub Action)
├── ready-to-publish-now/     # Immediate publish (merges PR right away)
├── published/                # Archive of successfully published posts
└── _publish-log.md           # Activity log (auto-generated)
```

## Publishing Workflows

### Publish a New Post

1. **Write** your post in `unpublished/` with valid frontmatter
2. **Choose timing**:
   - Move to `ready-to-publish-scheduled/` → Creates PR with label for scheduled merge
   - Move to `ready-to-publish-now/` → Creates and merges PR immediately
3. Post automatically moves to `published/` after success

### Update an Existing Post

Move a post from `published/` to `ready-to-publish-now/` (or scheduled) to update it on the live site. The plugin finds the existing post and updates it in place.

### Unpublish a Post

Move a post from `published/` back to `unpublished/`. This creates a PR that deletes the post from your Jekyll site.

### Withdraw a Pending Publish

Move a post from `ready-to-publish-scheduled/` back to `unpublished/`. This closes the pending PR without merging (the post was never published).

## Commands

Access these via the Command Palette (Ctrl/Cmd + P):

| Command | Description |
|---------|-------------|
| **Publish current note (immediate)** | Publish the active note right now |
| **Republish current note (update existing)** | Update an already-published post |
| **View activity log** | Open the site's publish activity log |
| **Open settings** | Open plugin settings |

## Frontmatter Requirements

Posts must include valid YAML frontmatter. Required fields:

```yaml
---
title: My Post Title
---
```

Optional fields:

```yaml
---
title: My Post Title
layout: post
description: A brief description
tags:
  - tag1
  - tag2
categories:
  - category1
date: 2026-01-15
image: /assets/images/featured.jpg
author: Your Name
---
```

The plugin validates frontmatter before publishing and blocks invalid posts with helpful error messages.

## Site Configuration

Each site can be configured with:

| Setting | Description | Default |
|---------|-------------|---------|
| **Name** | Display name for the site | - |
| **Vault Path** | Path in vault for this site's folders | `_www/sites/<name>` |
| **GitHub Repo** | Repository in `owner/repo` format | - |
| **Base Branch** | Branch to merge PRs into | `main` |
| **Site Base URL** | Live site URL for generating post links | - |
| **Posts Path** | Path in repo for posts | `_posts` |
| **Assets Path** | Path in repo for images | `assets/images` |
| **Scheduled Label** | Label for scheduled publish PRs | `ready-to-publish` |

## Activity Log

Each site maintains an activity log (`_publish-log.md`) that tracks:

- ✅ Published posts (with live URL)
- ⏳ Queued posts (with PR link)
- ↩️ Withdrawn posts
- 🗑️ Unpublished posts
- ❌ Failed operations (with error details)
- 📋 Validation failures

## How It Works

1. **File watcher** detects when you move files between folders
2. **Validation** checks frontmatter before any GitHub operations
3. **Content processing** converts wiki-links and collects assets
4. **GitHub API** creates branches, uploads files, and manages PRs
5. **Activity logging** records the operation result

The plugin uses Obsidian's `requestUrl` API for all GitHub operations, which:
- Bypasses CORS restrictions on mobile
- Requires no local git installation
- Works seamlessly on iOS/Android

## Sync Protection

The plugin only responds to **rename** events, not **create** events. This means:
- Files synced via Dropbox/iCloud (appear as creates) are ignored
- Only manual file moves trigger publish actions
- Safe to use with cloud sync services

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/jonwhittlestone/obsidian-github-web-publish.git
cd obsidian-github-web-publish

# Install dependencies
make install

# Create symlink to test vault
make symlink

# Start development build
make dev
```

### Available Commands

```bash
make help        # Show all available targets
make install     # Install npm dependencies
make dev         # Start development build with watch mode
make build       # Production build
make test        # Run unit tests
make test-watch  # Run unit tests in watch mode
make lint        # Run ESLint
make clean       # Remove build artifacts
make symlink     # Create symlink to test vault
```

### Project Structure

```
obsidian-github-web-publish/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings/            # Settings UI & types
│   ├── github/              # GitHub API client
│   ├── publishing/          # File watcher, publisher, validator
│   ├── logging/             # Activity log
│   └── ui/                  # Modals, status bar
├── tests/                   # Unit tests (97 tests)
├── Makefile                 # Build commands
├── manifest.json            # Obsidian plugin manifest
└── package.json             # npm configuration
```

## Requirements

- Obsidian v0.12.11 or higher
- GitHub account with repository access
- Jekyll blog with GitHub Pages deployment

## Troubleshooting

### Post returns 404 after publishing

Jekyll uses the frontmatter `date:` field for the URL, not the filename's date. Make sure your frontmatter date matches when you expect the post to appear.

### Validation errors

Check the activity log for specific validation errors. Common issues:
- Missing `title` field
- Invalid date format (use YYYY-MM-DD)
- Title exceeds 200 characters

### PR not merging

For scheduled publishes, ensure your GitHub repository has a GitHub Action configured to merge PRs with the scheduled label.

## License

MIT

## Author

Jon Whittlestone - [GitHub](https://github.com/jonwhittlestone)
