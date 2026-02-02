/**
 * Plugin settings type definitions
 */

export interface SiteConfig {
	/** Display name for this site */
	name: string;
	/** GitHub repository in format owner/repo */
	githubRepo: string;
	/** Target branch for PRs (usually 'main' or 'master') */
	baseBranch: string;
	/** Path to posts directory in repo (e.g., '_posts') */
	postsPath: string;
	/** Path to assets directory in repo (e.g., 'assets/images') */
	assetsPath: string;
	/** Label to add for scheduled publishing */
	scheduledLabel: string;
	/** Local vault path for this site */
	vaultPath: string;
	/** Base URL of the published site (e.g., 'https://example.github.io/blog') */
	siteBaseUrl?: string;
}

export interface GitHubAuth {
	/** Personal Access Token or OAuth token */
	token: string;
	/** Token type: 'pat' for Personal Access Token, 'oauth' for OAuth */
	tokenType: 'pat' | 'oauth';
	/** GitHub username (fetched after auth) */
	username?: string;
}

export interface PluginSettings {
	/** GitHub authentication */
	githubAuth: GitHubAuth | null;
	/** Configured sites */
	sites: SiteConfig[];
	/** Move files to published/ after successful publish */
	moveAfterPublish: boolean;
	/** Add date prefix to filename when publishing */
	addDatePrefix: boolean;
	/** Open PR in browser after creation */
	openPrInBrowser: boolean;
	/** Delete associated assets when unpublishing */
	deleteAssetsOnUnpublish: boolean;
	/** Require confirmation before unpublishing */
	confirmUnpublish: boolean;
	/** Custom OAuth Client ID (optional, for users who create their own GitHub OAuth App) */
	oauthClientId?: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	githubAuth: null,
	sites: [],
	moveAfterPublish: true,
	addDatePrefix: true,
	openPrInBrowser: false,
	deleteAssetsOnUnpublish: false,
	confirmUnpublish: true,
};
