/**
 * Tests for settings types and defaults
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import type { PluginSettings, SiteConfig, GitHubAuth } from '../src/settings/types';

describe('Settings Types', () => {
	describe('DEFAULT_SETTINGS', () => {
		it('should have null githubAuth by default', () => {
			expect(DEFAULT_SETTINGS.githubAuth).toBeNull();
		});

		it('should have empty sites array by default', () => {
			expect(DEFAULT_SETTINGS.sites).toEqual([]);
		});

		it('should enable moveAfterPublish by default', () => {
			expect(DEFAULT_SETTINGS.moveAfterPublish).toBe(true);
		});

		it('should enable addDatePrefix by default', () => {
			expect(DEFAULT_SETTINGS.addDatePrefix).toBe(true);
		});

		it('should disable openPrInBrowser by default', () => {
			expect(DEFAULT_SETTINGS.openPrInBrowser).toBe(false);
		});

		it('should enable activityLog by default', () => {
			expect(DEFAULT_SETTINGS.enableActivityLog).toBe(true);
		});

		it('should disable deleteAssetsOnUnpublish by default', () => {
			expect(DEFAULT_SETTINGS.deleteAssetsOnUnpublish).toBe(false);
		});

		it('should enable confirmUnpublish by default', () => {
			expect(DEFAULT_SETTINGS.confirmUnpublish).toBe(true);
		});
	});

	describe('PluginSettings interface', () => {
		it('should accept valid settings object', () => {
			const settings: PluginSettings = {
				githubAuth: {
					token: 'ghp_test123',
					tokenType: 'pat',
					username: 'testuser',
				},
				sites: [],
				moveAfterPublish: true,
				addDatePrefix: true,
				openPrInBrowser: false,
				enableActivityLog: true,
				deleteAssetsOnUnpublish: false,
				confirmUnpublish: true,
			};

			expect(settings.githubAuth?.token).toBe('ghp_test123');
			expect(settings.githubAuth?.tokenType).toBe('pat');
		});
	});

	describe('SiteConfig interface', () => {
		it('should accept valid site configuration', () => {
			const site: SiteConfig = {
				name: 'My Blog',
				githubRepo: 'username/repo',
				baseBranch: 'main',
				postsPath: '_posts',
				assetsPath: 'assets/images',
				scheduledLabel: 'ready-to-publish',
				vaultPath: '_www/sites/blog',
			};

			expect(site.githubRepo).toBe('username/repo');
			expect(site.baseBranch).toBe('main');
		});
	});

	describe('GitHubAuth interface', () => {
		it('should accept PAT authentication', () => {
			const auth: GitHubAuth = {
				token: 'ghp_xxxxxxxxxxxx',
				tokenType: 'pat',
				username: 'testuser',
			};

			expect(auth.tokenType).toBe('pat');
		});

		it('should accept OAuth authentication', () => {
			const auth: GitHubAuth = {
				token: 'gho_xxxxxxxxxxxx',
				tokenType: 'oauth',
				username: 'testuser',
			};

			expect(auth.tokenType).toBe('oauth');
		});

		it('should allow optional username', () => {
			const auth: GitHubAuth = {
				token: 'ghp_xxxxxxxxxxxx',
				tokenType: 'pat',
			};

			expect(auth.username).toBeUndefined();
		});
	});
});

describe('Settings Merge Behavior', () => {
	it('should merge partial settings with defaults', () => {
		const partialSettings = {
			openPrInBrowser: true,
		};

		const merged = Object.assign({}, DEFAULT_SETTINGS, partialSettings);

		expect(merged.openPrInBrowser).toBe(true);
		expect(merged.moveAfterPublish).toBe(true); // From defaults
		expect(merged.githubAuth).toBeNull(); // From defaults
	});

	it('should preserve existing auth when merging', () => {
		const existingSettings = {
			githubAuth: {
				token: 'ghp_existing',
				tokenType: 'pat' as const,
				username: 'existinguser',
			},
		};

		const merged = Object.assign({}, DEFAULT_SETTINGS, existingSettings);

		expect(merged.githubAuth?.token).toBe('ghp_existing');
		expect(merged.githubAuth?.username).toBe('existinguser');
	});
});
