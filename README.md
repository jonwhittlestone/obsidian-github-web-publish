# GitHub Web Publish

An Obsidian plugin for publishing notes to Jekyll/GitHub Pages via PR workflow.

## Features

- **Directory-based publishing**: Move files to trigger publish actions
- **Scheduled publishing**: Queue posts for automatic merge at 2pm UK time
- **Immediate publishing**: Merge PRs instantly when needed
- **Mobile compatible**: Works on iOS and Android
- **No git required**: All GitHub operations via API

## Installation

### From Community Plugins (Coming Soon)

1. Open Obsidian Settings → Community plugins
2. Search for "GitHub Web Publish"
3. Install and enable

### Manual Installation

1. Download the latest release
2. Extract to `.obsidian/plugins/obsidian-github-web-publish/`
3. Enable in Settings → Community plugins

## Usage

### Directory Structure

Create this structure in your vault:

```
_www/sites/<your-site>/
├── unpublished/          # Draft posts (not synced)
├── ready-for-publish/    # Queue for scheduled publish
├── ready-for-publish-now/ # Immediate publish
└── published/            # Archive of published posts
```

### Publishing Workflow

1. **Write** your post in `unpublished/`
2. **Schedule**: Move to `ready-for-publish/` (publishes at 2pm UK)
3. **Or immediate**: Move to `ready-for-publish-now/` (publishes now)
4. Post automatically moves to `published/` after success

### Unpublishing

Move a post from `published/` back to `unpublished/` to remove it from your blog.

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

### Testing

```bash
# Run all tests
make test

# Run tests in watch mode
make test-watch
```

### Project Structure

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
│   └── mocks/               # Obsidian API mocks
├── Makefile                 # Build commands
├── manifest.json            # Obsidian plugin manifest
└── package.json             # npm configuration
```

## Configuration

After installing, configure in Settings → GitHub Web Publish:

1. **Login with GitHub**: Authenticate via OAuth device flow
2. **Add Site**: Configure your Jekyll blog repository
3. **Set paths**: Specify `_posts` and assets directories

## Requirements

- Obsidian v0.12.11 or higher
- GitHub account with repository access
- Jekyll blog with GitHub Actions for deployment

## License

MIT

## Author

Jon Whittlestone - [GitHub](https://github.com/jonwhittlestone)
