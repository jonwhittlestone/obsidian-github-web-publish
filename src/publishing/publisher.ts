/**
 * Publisher - Orchestrates the publish flow
 *
 * Handles: branch creation, file upload, PR creation, label assignment
 */

import { TFile, Vault } from 'obsidian';
import { GitHubClient } from '../github';
import type { SiteConfig, PluginSettings } from '../settings/types';

export interface PublishResult {
	success: boolean;
	prNumber?: number;
	prUrl?: string;
	error?: string;
}

/**
 * Generate a URL-safe slug from a filename
 */
function slugify(filename: string): string {
	return filename
		.replace(/\.md$/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Publisher handles the GitHub publish workflow
 */
export class Publisher {
	private vault: Vault;
	private settings: PluginSettings;

	constructor(vault: Vault, settings: PluginSettings) {
		this.vault = vault;
		this.settings = settings;
	}

	/**
	 * Publish a file to GitHub
	 *
	 * @param file The file to publish
	 * @param site The site configuration
	 * @param immediate If true, merge PR immediately; if false, add scheduled label
	 */
	async publish(file: TFile, site: SiteConfig, immediate: boolean): Promise<PublishResult> {
		// Validate we have auth
		if (!this.settings.githubAuth?.token) {
			return { success: false, error: 'Not authenticated with GitHub' };
		}

		// Parse owner/repo from site config
		const [owner, repo] = site.githubRepo.split('/');
		if (!owner || !repo) {
			return { success: false, error: 'Invalid repository format. Expected owner/repo' };
		}

		// Create GitHub client
		const client = new GitHubClient({
			token: this.settings.githubAuth.token,
			owner,
			repo,
		});

		try {
			// Read file content
			const content = await this.vault.read(file);

			// Generate slug and branch name
			const slug = slugify(file.basename);
			const datePrefix = this.settings.addDatePrefix ? getTodayDate() : '';
			const targetFilename = datePrefix ? `${datePrefix}-${slug}.md` : `${slug}.md`;
			const branchName = `publish/${slug}`;

			// Create branch
			await client.createBranch(branchName, site.baseBranch);

			// Upload file to _posts (or configured posts path)
			const targetPath = `${site.postsPath}/${targetFilename}`;
			await client.createOrUpdateFile(
				targetPath,
				content,
				`Add post: ${file.basename}`,
				branchName
			);

			// Create PR
			const prTitle = `Publish: ${file.basename}`;
			const prBody = `Publishing "${file.basename}" to ${site.name}.\n\nCreated by Obsidian GitHub Web Publish plugin.`;
			const pr = await client.createPullRequest(prTitle, branchName, site.baseBranch, prBody);

			if (immediate) {
				// Merge immediately
				await client.mergePullRequest(pr.number, prTitle);
				// Clean up branch
				try {
					await client.deleteBranch(branchName);
				} catch {
					// Branch deletion can fail if GitHub auto-deleted it
				}
			} else {
				// Add scheduled publish label
				await client.addLabels(pr.number, [site.scheduledLabel]);
			}

			return {
				success: true,
				prNumber: pr.number,
				prUrl: pr.html_url,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { success: false, error: message };
		}
	}
}
