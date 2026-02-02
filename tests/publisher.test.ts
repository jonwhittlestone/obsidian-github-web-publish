/**
 * Publisher tests - testing publish and unpublish workflows
 */

/* eslint-disable obsidianmd/no-tfile-tfolder-cast */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Publisher } from '../src/publishing/publisher';
import type { PluginSettings, SiteConfig } from '../src/settings/types';
import type { TFile, Vault, RequestUrlResponse } from 'obsidian';

// Mock requestUrl at module level
vi.mock('obsidian', () => ({
	requestUrl: vi.fn(),
}));

import { requestUrl } from 'obsidian';

const mockRequestUrl = vi.mocked(requestUrl);

/** Helper to create mock API responses */
function mockResponse(status: number, json: unknown): RequestUrlResponse {
	return {
		status,
		json,
		headers: {},
		text: JSON.stringify(json),
		arrayBuffer: new ArrayBuffer(0),
	};
}

describe('Publisher', () => {
	let publisher: Publisher;
	let mockVault: Vault;
	let mockSettings: PluginSettings;
	let mockSite: SiteConfig;
	let mockFile: TFile;

	beforeEach(() => {
		vi.clearAllMocks();

		mockVault = {
			read: vi.fn().mockResolvedValue('---\ntitle: Test Post\n---\n\nContent'),
			getAbstractFileByPath: vi.fn().mockReturnValue(null),
			getFiles: vi.fn().mockReturnValue([]),
		} as unknown as Vault;

		mockSettings = {
			githubAuth: {
				token: 'test-token',
				tokenType: 'pat',
				username: 'testuser',
			},
			sites: [],
			moveAfterPublish: true,
			addDatePrefix: true,
			openPrInBrowser: false,
			deleteAssetsOnUnpublish: false,
			confirmUnpublish: true,
		};

		mockSite = {
			name: 'Test Site',
			githubRepo: 'testowner/testrepo',
			baseBranch: 'main',
			postsPath: '_posts',
			assetsPath: 'assets/images',
			scheduledLabel: 'ready-to-publish',
			vaultPath: '_www/sites/test',
		};

		mockFile = {
			path: '_www/sites/test/unpublished/test-post.md',
			name: 'test-post.md',
			basename: 'test-post',
			extension: 'md',
		} as TFile;

		publisher = new Publisher(mockVault, mockSettings);
	});

	describe('unpublish', () => {
		it('should return error if not authenticated', async () => {
			mockSettings.githubAuth = null;
			publisher = new Publisher(mockVault, mockSettings);

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Not authenticated with GitHub');
		});

		it('should return error if repo format is invalid', async () => {
			mockSite.githubRepo = 'invalid-repo';

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Invalid repository format. Expected owner/repo');
		});

		it('should return error if no matching post found', async () => {
			mockRequestUrl.mockResolvedValueOnce(mockResponse(200, []));

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(false);
			expect(result.error).toContain('No published post found');
		});

		it('should successfully unpublish a post', async () => {
			mockRequestUrl
				.mockResolvedValueOnce(mockResponse(200, [
					{ name: '2026-02-01-test-post.md', path: '_posts/2026-02-01-test-post.md', sha: 'abc123', type: 'file' },
				]))
				.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'main-sha-123' } }))
				.mockResolvedValueOnce(mockResponse(201, { ref: 'refs/heads/unpublish/test-post', object: { sha: 'branch-sha' } }))
				.mockResolvedValueOnce(mockResponse(200, { commit: { sha: 'commit-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { number: 42, html_url: 'https://github.com/testowner/testrepo/pull/42', title: 'Unpublish: test-post' }))
				.mockResolvedValueOnce(mockResponse(200, { merged: true }))
				.mockResolvedValueOnce(mockResponse(204, {}));

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(true);
			expect(result.deletedFiles).toContain('_posts/2026-02-01-test-post.md');
		});

		it('should match posts with date prefix pattern', async () => {
			mockRequestUrl
				.mockResolvedValueOnce(mockResponse(200, [
					{ name: '2025-01-15-test-post.md', path: '_posts/2025-01-15-test-post.md', sha: 'sha1', type: 'file' },
					{ name: '2026-02-01-test-post.md', path: '_posts/2026-02-01-test-post.md', sha: 'sha2', type: 'file' },
					{ name: 'other-post.md', path: '_posts/other-post.md', sha: 'sha3', type: 'file' },
				]))
				.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'main-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { ref: 'refs/heads/unpublish/test-post', object: { sha: 'sha' } }))
				.mockResolvedValueOnce(mockResponse(200, {}))
				.mockResolvedValueOnce(mockResponse(200, {}))
				.mockResolvedValueOnce(mockResponse(201, { number: 1, html_url: 'url', title: 'title' }))
				.mockResolvedValueOnce(mockResponse(200, { merged: true }))
				.mockResolvedValueOnce(mockResponse(204, {}));

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(true);
			expect(result.deletedFiles).toHaveLength(2);
			expect(result.deletedFiles).toContain('_posts/2025-01-15-test-post.md');
			expect(result.deletedFiles).toContain('_posts/2026-02-01-test-post.md');
		});

		it('should delete assets when deleteAssets is true', async () => {
			mockRequestUrl
				.mockResolvedValueOnce(mockResponse(200, [
					{ name: '2026-02-01-test-post.md', path: '_posts/2026-02-01-test-post.md', sha: 'post-sha', type: 'file' },
				]))
				.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'main-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { ref: 'ref', object: { sha: 'sha' } }))
				.mockResolvedValueOnce(mockResponse(200, {}))
				.mockResolvedValueOnce(mockResponse(200, [
					{ name: 'test-post-image1.png', path: 'assets/images/test-post-image1.png', sha: 'asset-sha-1', type: 'file' },
					{ name: 'test-post-image2.jpg', path: 'assets/images/test-post-image2.jpg', sha: 'asset-sha-2', type: 'file' },
					{ name: 'other-image.png', path: 'assets/images/other-image.png', sha: 'other-sha', type: 'file' },
				]))
				.mockResolvedValueOnce(mockResponse(200, {}))
				.mockResolvedValueOnce(mockResponse(200, {}))
				.mockResolvedValueOnce(mockResponse(201, { number: 1, html_url: 'url', title: 'title' }))
				.mockResolvedValueOnce(mockResponse(200, { merged: true }))
				.mockResolvedValueOnce(mockResponse(204, {}));

			const result = await publisher.unpublish(mockFile, mockSite, true);

			expect(result.success).toBe(true);
			expect(result.deletedFiles).toContain('_posts/2026-02-01-test-post.md');
			expect(result.deletedFiles).toContain('assets/images/test-post-image1.png');
			expect(result.deletedFiles).toContain('assets/images/test-post-image2.jpg');
			expect(result.deletedFiles).not.toContain('assets/images/other-image.png');
		});

		it('should handle API errors gracefully', async () => {
			mockRequestUrl.mockRejectedValueOnce(new Error('Network error'));

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Network error');
		});
	});

	describe('publish', () => {
		it('should use frontmatter date for live URL instead of file date prefix', async () => {
			// Override vault.read to return content with frontmatter date
			(mockVault.read as ReturnType<typeof vi.fn>).mockResolvedValue('---\ntitle: Test Post\ncategories:\n  - tech\ndate: 2025-06-15\n---\n\nContent');

			mockSite.siteBaseUrl = 'https://example.com/blog';

			// Mock API responses for publish flow
			mockRequestUrl
				.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'main-sha' } })) // Get branch ref
				.mockResolvedValueOnce(mockResponse(201, { ref: 'refs/heads/publish/test-post', object: { sha: 'new-sha' } })) // Create branch
				.mockResolvedValueOnce(mockResponse(201, { content: { sha: 'file-sha' } })) // Create file
				.mockResolvedValueOnce(mockResponse(201, { number: 1, html_url: 'https://github.com/testowner/testrepo/pull/1', title: 'Publish: test-post' })) // Create PR
				.mockResolvedValueOnce(mockResponse(200, { merged: true })) // Merge PR
				.mockResolvedValueOnce(mockResponse(204, {})); // Delete branch

			const result = await publisher.publish(mockFile, mockSite, true);

			expect(result.success).toBe(true);
			// The URL should use the frontmatter date (2025-06-15), not today's date
			expect(result.liveUrl).toBe('https://example.com/blog/tech/2025/06/15/test-post.html');
		});

		it('should fallback to file date prefix when no frontmatter date', async () => {
			// Override vault.read to return content without date field
			(mockVault.read as ReturnType<typeof vi.fn>).mockResolvedValue('---\ntitle: Test Post\ncategories:\n  - tech\n---\n\nContent');

			mockSite.siteBaseUrl = 'https://example.com/blog';

			// Mock API responses
			mockRequestUrl
				.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'main-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { ref: 'refs/heads/publish/test-post', object: { sha: 'new-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { content: { sha: 'file-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { number: 1, html_url: 'https://github.com/testowner/testrepo/pull/1', title: 'Publish: test-post' }))
				.mockResolvedValueOnce(mockResponse(200, { merged: true }))
				.mockResolvedValueOnce(mockResponse(204, {}));

			const result = await publisher.publish(mockFile, mockSite, true);

			expect(result.success).toBe(true);
			// Without frontmatter date, should use today's date (verify format matches pattern)
			expect(result.liveUrl).toMatch(/https:\/\/example\.com\/blog\/tech\/\d{4}\/\d{2}\/\d{2}\/test-post\.html/);
		});

		it('should generate URL without category when not present in frontmatter', async () => {
			// Override vault.read to return content without categories
			(mockVault.read as ReturnType<typeof vi.fn>).mockResolvedValue('---\ntitle: Test Post\ndate: 2025-06-15\n---\n\nContent');

			mockSite.siteBaseUrl = 'https://example.com/blog';

			mockRequestUrl
				.mockResolvedValueOnce(mockResponse(200, { object: { sha: 'main-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { ref: 'refs/heads/publish/test-post', object: { sha: 'new-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { content: { sha: 'file-sha' } }))
				.mockResolvedValueOnce(mockResponse(201, { number: 1, html_url: 'https://github.com/testowner/testrepo/pull/1', title: 'Publish: test-post' }))
				.mockResolvedValueOnce(mockResponse(200, { merged: true }))
				.mockResolvedValueOnce(mockResponse(204, {}));

			const result = await publisher.publish(mockFile, mockSite, true);

			expect(result.success).toBe(true);
			// URL should not include category
			expect(result.liveUrl).toBe('https://example.com/blog/2025/06/15/test-post.html');
		});
	});
});

describe('slugify via unpublish', () => {
	it('should generate correct slugs for various filenames', async () => {
		vi.clearAllMocks();

		const testVault = {
			read: vi.fn(),
			getAbstractFileByPath: vi.fn(),
			getFiles: vi.fn().mockReturnValue([]),
		} as unknown as Vault;

		const testSettings: PluginSettings = {
			githubAuth: { token: 'test', tokenType: 'pat' },
			sites: [],
			moveAfterPublish: true,
			addDatePrefix: true,
			openPrInBrowser: false,
			deleteAssetsOnUnpublish: false,
			confirmUnpublish: true,
		};

		const testSite: SiteConfig = {
			name: 'Test',
			githubRepo: 'owner/repo',
			baseBranch: 'main',
			postsPath: '_posts',
			assetsPath: 'assets',
			scheduledLabel: 'publish',
			vaultPath: 'test',
		};

		const testPublisher = new Publisher(testVault, testSettings);

		const testFile = {
			path: 'test/My Post Title!.md',
			name: 'My Post Title!.md',
			basename: 'My Post Title!',
			extension: 'md',
		} as TFile;

		// Mock empty file list for unpublish to trigger "not found" error with slug in message
		mockRequestUrl.mockResolvedValueOnce(mockResponse(200, []));

		const result = await testPublisher.unpublish(testFile, testSite, false);

		expect(result.error).toContain('my-post-title');
	});
});
