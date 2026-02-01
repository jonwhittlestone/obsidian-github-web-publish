# Makefile for obsidian-github-web-publish
# Obsidian plugin for publishing notes to Jekyll/GitHub Pages

.PHONY: help install dev build test test-watch lint clean symlink

# Default target
help:
	@echo "Available targets:"
	@echo ""
	@echo "  install      Install npm dependencies"
	@echo "  dev          Start development build with watch mode"
	@echo "  build        Production build (type-check + bundle)"
	@echo "  test         Run unit tests"
	@echo "  test-watch   Run unit tests in watch mode"
	@echo "  lint         Run ESLint"
	@echo "  clean        Remove build artifacts"
	@echo "  symlink      Create symlink to test vault"
	@echo ""
	@echo "Development workflow:"
	@echo "  1. make install    (first time only)"
	@echo "  2. make symlink    (first time only)"
	@echo "  3. make dev        (in one terminal)"
	@echo "  4. Open test vault in Obsidian"
	@echo ""

# Install dependencies
install:
	npm install

# Development build with watch mode
dev:
	npm run dev

# Production build
build:
	npm run build

# Run unit tests
test:
	npm run test

# Run unit tests in watch mode
test-watch:
	npm run test:watch

# Run linter
lint:
	npm run lint

# Clean build artifacts
clean:
	rm -f main.js main.js.map
	rm -rf coverage/

# Create symlink to test vault
TEST_VAULT := /home/jon/code/playground/test-vault-for-obsidian-development
PLUGIN_DIR := $(TEST_VAULT)/.obsidian/plugins/obsidian-github-web-publish

symlink:
	@echo "Creating symlink to test vault..."
	@mkdir -p $(TEST_VAULT)/.obsidian/plugins
	@if [ -L "$(PLUGIN_DIR)" ]; then \
		echo "Symlink already exists"; \
	elif [ -d "$(PLUGIN_DIR)" ]; then \
		echo "Error: $(PLUGIN_DIR) exists and is not a symlink"; \
		exit 1; \
	else \
		ln -s $(CURDIR) $(PLUGIN_DIR); \
		echo "Symlink created: $(PLUGIN_DIR) -> $(CURDIR)"; \
	fi
