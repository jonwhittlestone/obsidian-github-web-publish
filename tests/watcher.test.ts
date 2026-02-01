/**
 * Tests for FileWatcher - file move detection and sync protection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { TAbstractFile } from 'obsidian';
import { FileWatcher, SITE_FOLDERS } from '../src/publishing/watcher';
import type { SiteConfig } from '../src/settings/types';
import type GitHubWebPublishPlugin from '../src/main';

// Create a mock file that satisfies TAbstractFile with TFile properties
function createMockFile(path: string): TAbstractFile & { extension: string } {
	const name = path.split('/').pop() || '';
	const extension = name.includes('.') ? name.split('.').pop() || '' : '';
	return {
		path,
		name,
		extension,
		// Required TAbstractFile properties (mocked)
		vault: {} as TAbstractFile['vault'],
		parent: null,
	};
}

// Mock plugin - partial implementation for testing FileWatcher
function createMockPlugin(sites: SiteConfig[]): Pick<GitHubWebPublishPlugin, 'settings'> {
	return {
		settings: {
			sites,
			githubAuth: null,
			moveAfterPublish: true,
			addDatePrefix: true,
			openPrInBrowser: false,
			deleteAssetsOnUnpublish: false,
			confirmUnpublish: true,
		},
	};
}

// Default test site config
const testSite: SiteConfig = {
	name: 'Test Site',
	githubRepo: 'user/repo',
	baseBranch: 'main',
	postsPath: '_posts',
	assetsPath: 'assets',
	scheduledLabel: 'ready-to-publish',
	vaultPath: '_www/sites/test-site',
};

describe('FileWatcher', () => {
	describe('SITE_FOLDERS constants', () => {
		it('should have correct folder names', () => {
			expect(SITE_FOLDERS.UNPUBLISHED).toBe('unpublished');
			expect(SITE_FOLDERS.READY_FOR_PUBLISH).toBe('ready-for-publish');
			expect(SITE_FOLDERS.READY_FOR_PUBLISH_NOW).toBe('ready-for-publish-now');
			expect(SITE_FOLDERS.PUBLISHED).toBe('published');
		});
	});

	describe('handleFileMove', () => {
		let watcher: FileWatcher;

		beforeEach(() => {
			const plugin = createMockPlugin([testSite]);
			watcher = new FileWatcher(plugin as unknown as GitHubWebPublishPlugin);
		});

		describe('sync protection - ignores files not from tracked origin', () => {
			it('should ignore files where old path is not in a site folder', () => {
				// Simulates Dropbox sync: file appears in published/ but old path is unknown
				const file = createMockFile('_www/sites/test-site/published/post.md');
				const oldPath = 'some/random/path/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('none');
			});

			it('should ignore non-markdown files', () => {
				const file = createMockFile('_www/sites/test-site/ready-for-publish/image.png');
				const oldPath = '_www/sites/test-site/unpublished/image.png';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('none');
			});
		});

		describe('publish triggers', () => {
			it('should trigger schedule-publish when moving to ready-for-publish', () => {
				const file = createMockFile('_www/sites/test-site/ready-for-publish/post.md');
				const oldPath = '_www/sites/test-site/unpublished/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('schedule-publish');
				expect(action.type === 'schedule-publish' && action.site).toBe(testSite);
			});

			it('should trigger immediate-publish when moving to ready-for-publish-now', () => {
				const file = createMockFile('_www/sites/test-site/ready-for-publish-now/post.md');
				const oldPath = '_www/sites/test-site/unpublished/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('immediate-publish');
			});
		});

		describe('unpublish triggers', () => {
			it('should trigger unpublish when moving from published to unpublished', () => {
				const file = createMockFile('_www/sites/test-site/unpublished/post.md');
				const oldPath = '_www/sites/test-site/published/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('unpublish');
			});
		});

		describe('update triggers', () => {
			it('should trigger update when moving from published to ready-for-publish', () => {
				const file = createMockFile('_www/sites/test-site/ready-for-publish/post.md');
				const oldPath = '_www/sites/test-site/published/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('update');
			});

			it('should trigger update when moving from published to ready-for-publish-now', () => {
				const file = createMockFile('_www/sites/test-site/ready-for-publish-now/post.md');
				const oldPath = '_www/sites/test-site/published/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('update');
			});
		});

		describe('no action cases', () => {
			it('should ignore moves within the same folder', () => {
				const file = createMockFile('_www/sites/test-site/unpublished/renamed-post.md');
				const oldPath = '_www/sites/test-site/unpublished/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('none');
			});

			it('should ignore moves to published folder (handled by plugin after PR merge)', () => {
				const file = createMockFile('_www/sites/test-site/published/post.md');
				const oldPath = '_www/sites/test-site/ready-for-publish/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('none');
			});

			it('should ignore when no sites are configured', () => {
				const plugin = createMockPlugin([]);
				const watcher = new FileWatcher(plugin as unknown as GitHubWebPublishPlugin);

				const file = createMockFile('_www/sites/test-site/ready-for-publish/post.md');
				const oldPath = '_www/sites/test-site/unpublished/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('none');
			});

			it('should ignore files moved outside site folders', () => {
				const file = createMockFile('random/folder/post.md');
				const oldPath = '_www/sites/test-site/unpublished/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('none');
			});
		});

		describe('nested file paths', () => {
			it('should handle files in subdirectories', () => {
				const file = createMockFile('_www/sites/test-site/ready-for-publish/2026/01/post.md');
				const oldPath = '_www/sites/test-site/unpublished/drafts/post.md';

				const action = watcher.handleFileMove(file, oldPath);

				expect(action.type).toBe('schedule-publish');
			});
		});
	});

	describe('multi-site support', () => {
		it('should correctly identify files from different sites', () => {
			const site1: SiteConfig = { ...testSite, name: 'Site 1', vaultPath: '_www/sites/site1' };
			const site2: SiteConfig = { ...testSite, name: 'Site 2', vaultPath: '_www/sites/site2' };

			const plugin = createMockPlugin([site1, site2]);
			const watcher = new FileWatcher(plugin as unknown as GitHubWebPublishPlugin);

			const file = createMockFile('_www/sites/site2/ready-for-publish/post.md');
			const oldPath = '_www/sites/site2/unpublished/post.md';

			const action = watcher.handleFileMove(file, oldPath);

			expect(action.type).toBe('schedule-publish');
			expect(action.type === 'schedule-publish' && action.site).toBe(site2);
		});
	});
});
