/**
 * Publisher tests - testing publish and unpublish workflows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Publisher } from '../src/publishing/publisher';
import type { PluginSettings, SiteConfig } from '../src/settings/types';
import type { TFile, Vault } from 'obsidian';

// Mock requestUrl at module level
vi.mock('obsidian', () => ({
	requestUrl: vi.fn(),
}));

import { requestUrl } from 'obsidian';

const mockRequestUrl = vi.mocked(requestUrl);

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
			// Mock listFiles to return empty array
			mockRequestUrl
				.mockResolvedValueOnce({
					// List files in _posts - empty
					status: 200,
					json: [],
					headers: {},
					text: '[]',
				});

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(false);
			expect(result.error).toContain('No published post found');
		});

		it('should successfully unpublish a post', async () => {
			// Setup mock responses for the full unpublish flow
			mockRequestUrl
				// 1. List files in _posts
				.mockResolvedValueOnce({
					status: 200,
					json: [
						{ name: '2026-02-01-test-post.md', path: '_posts/2026-02-01-test-post.md', sha: 'abc123', type: 'file' },
					],
					headers: {},
					text: '',
				})
				// 2. Get branch SHA for creating new branch
				.mockResolvedValueOnce({
					status: 200,
					json: { object: { sha: 'main-sha-123' } },
					headers: {},
					text: '',
				})
				// 3. Create branch
				.mockResolvedValueOnce({
					status: 201,
					json: { ref: 'refs/heads/unpublish/test-post', object: { sha: 'branch-sha' } },
					headers: {},
					text: '',
				})
				// 4. Delete file
				.mockResolvedValueOnce({
					status: 200,
					json: { commit: { sha: 'commit-sha' } },
					headers: {},
					text: '',
				})
				// 5. Create PR
				.mockResolvedValueOnce({
					status: 201,
					json: { number: 42, html_url: 'https://github.com/testowner/testrepo/pull/42', title: 'Unpublish: test-post' },
					headers: {},
					text: '',
				})
				// 6. Merge PR
				.mockResolvedValueOnce({
					status: 200,
					json: { merged: true },
					headers: {},
					text: '',
				})
				// 7. Delete branch
				.mockResolvedValueOnce({
					status: 204,
					json: {},
					headers: {},
					text: '',
				});

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(true);
			expect(result.deletedFiles).toContain('_posts/2026-02-01-test-post.md');
		});

		it('should match posts with date prefix pattern', async () => {
			// Test that various date-prefixed filenames are matched correctly
			mockRequestUrl
				.mockResolvedValueOnce({
					status: 200,
					json: [
						{ name: '2025-01-15-test-post.md', path: '_posts/2025-01-15-test-post.md', sha: 'sha1', type: 'file' },
						{ name: '2026-02-01-test-post.md', path: '_posts/2026-02-01-test-post.md', sha: 'sha2', type: 'file' },
						{ name: 'other-post.md', path: '_posts/other-post.md', sha: 'sha3', type: 'file' },
					],
					headers: {},
					text: '',
				})
				// Remaining mocks for the flow
				.mockResolvedValueOnce({ status: 200, json: { object: { sha: 'main-sha' } }, headers: {}, text: '' })
				.mockResolvedValueOnce({ status: 201, json: { ref: 'refs/heads/unpublish/test-post', object: { sha: 'sha' } }, headers: {}, text: '' })
				.mockResolvedValueOnce({ status: 200, json: {}, headers: {}, text: '' }) // Delete file 1
				.mockResolvedValueOnce({ status: 200, json: {}, headers: {}, text: '' }) // Delete file 2
				.mockResolvedValueOnce({ status: 201, json: { number: 1, html_url: 'url', title: 'title' }, headers: {}, text: '' })
				.mockResolvedValueOnce({ status: 200, json: { merged: true }, headers: {}, text: '' })
				.mockResolvedValueOnce({ status: 204, json: {}, headers: {}, text: '' });

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(true);
			// Should match both date-prefixed versions of test-post
			expect(result.deletedFiles).toHaveLength(2);
			expect(result.deletedFiles).toContain('_posts/2025-01-15-test-post.md');
			expect(result.deletedFiles).toContain('_posts/2026-02-01-test-post.md');
		});

		it('should delete assets when deleteAssets is true', async () => {
			mockRequestUrl
				// 1. List files in _posts
				.mockResolvedValueOnce({
					status: 200,
					json: [
						{ name: '2026-02-01-test-post.md', path: '_posts/2026-02-01-test-post.md', sha: 'post-sha', type: 'file' },
					],
					headers: {},
					text: '',
				})
				// 2. Get branch SHA
				.mockResolvedValueOnce({ status: 200, json: { object: { sha: 'main-sha' } }, headers: {}, text: '' })
				// 3. Create branch
				.mockResolvedValueOnce({ status: 201, json: { ref: 'ref', object: { sha: 'sha' } }, headers: {}, text: '' })
				// 4. Delete post file
				.mockResolvedValueOnce({ status: 200, json: {}, headers: {}, text: '' })
				// 5. List assets
				.mockResolvedValueOnce({
					status: 200,
					json: [
						{ name: 'test-post-image1.png', path: 'assets/images/test-post-image1.png', sha: 'asset-sha-1', type: 'file' },
						{ name: 'test-post-image2.jpg', path: 'assets/images/test-post-image2.jpg', sha: 'asset-sha-2', type: 'file' },
						{ name: 'other-image.png', path: 'assets/images/other-image.png', sha: 'other-sha', type: 'file' },
					],
					headers: {},
					text: '',
				})
				// 6. Delete asset 1
				.mockResolvedValueOnce({ status: 200, json: {}, headers: {}, text: '' })
				// 7. Delete asset 2
				.mockResolvedValueOnce({ status: 200, json: {}, headers: {}, text: '' })
				// 8. Create PR
				.mockResolvedValueOnce({ status: 201, json: { number: 1, html_url: 'url', title: 'title' }, headers: {}, text: '' })
				// 9. Merge PR
				.mockResolvedValueOnce({ status: 200, json: { merged: true }, headers: {}, text: '' })
				// 10. Delete branch
				.mockResolvedValueOnce({ status: 204, json: {}, headers: {}, text: '' });

			const result = await publisher.unpublish(mockFile, mockSite, true);

			expect(result.success).toBe(true);
			expect(result.deletedFiles).toContain('_posts/2026-02-01-test-post.md');
			expect(result.deletedFiles).toContain('assets/images/test-post-image1.png');
			expect(result.deletedFiles).toContain('assets/images/test-post-image2.jpg');
			// Should NOT include other-image.png (doesn't match slug prefix)
			expect(result.deletedFiles).not.toContain('assets/images/other-image.png');
		});

		it('should handle API errors gracefully', async () => {
			mockRequestUrl.mockRejectedValueOnce(new Error('Network error'));

			const result = await publisher.unpublish(mockFile, mockSite, false);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Network error');
		});
	});
});

describe('slugify', () => {
	// Test the slugify function indirectly through unpublish behavior
	it('should generate correct slugs for various filenames', async () => {
		const mockVault = {
			read: vi.fn(),
			getAbstractFileByPath: vi.fn(),
			getFiles: vi.fn().mockReturnValue([]),
		} as unknown as Vault;

		const mockSettings: PluginSettings = {
			githubAuth: { token: 'test', tokenType: 'pat' },
			sites: [],
			moveAfterPublish: true,
			addDatePrefix: true,
			openPrInBrowser: false,
			deleteAssetsOnUnpublish: false,
			confirmUnpublish: true,
		};

		const mockSite: SiteConfig = {
			name: 'Test',
			githubRepo: 'owner/repo',
			baseBranch: 'main',
			postsPath: '_posts',
			assetsPath: 'assets',
			scheduledLabel: 'publish',
			vaultPath: 'test',
		};

		const publisher = new Publisher(mockVault, mockSettings);

		// Test with a file that has spaces and special characters
		const testFile = {
			path: 'test/My Post Title!.md',
			name: 'My Post Title!.md',
			basename: 'My Post Title!',
			extension: 'md',
		} as TFile;

		mockRequestUrl.mockResolvedValueOnce({
			status: 200,
			json: [],
			headers: {},
			text: '',
		});

		const result = await publisher.unpublish(testFile, mockSite, false);

		// The error message should contain the slugified version
		expect(result.error).toContain('my-post-title');
	});
});
