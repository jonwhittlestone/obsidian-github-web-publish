/**
 * Publisher - Orchestrates the publish flow
 *
 * Handles: branch creation, file upload, PR creation, label assignment
 */

import { TFile, TAbstractFile, Vault } from 'obsidian';
import { GitHubClient } from '../github';
import { FrontmatterValidator } from './validator';
import { ContentProcessor } from './content-processor';
import type { SiteConfig, PluginSettings } from '../settings/types';
import type { ValidationResult } from './validator';
import type { AssetReference } from './content-processor';

export interface PublishResult {
	success: boolean;
	prNumber?: number;
	prUrl?: string;
	error?: string;
	validationResult?: ValidationResult;
	/** Assets referenced in the content (for future upload) */
	assets?: AssetReference[];
}

export interface UnpublishResult {
	success: boolean;
	deletedFiles: string[];
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

		// Validate frontmatter before any GitHub operations
		const validator = new FrontmatterValidator(this.vault);
		const validationResult = await validator.validate(file);

		if (!validationResult.valid) {
			const errorMessage = FrontmatterValidator.formatErrors(validationResult);
			return {
				success: false,
				error: `Validation failed:\n${errorMessage}`,
				validationResult,
			};
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
			const rawContent = await this.vault.read(file);

			// Generate slug for branch name and asset prefix
			const slug = slugify(file.basename);

			// Process content: convert wiki-links to standard markdown
			const processor = new ContentProcessor({
				assetsBasePath: `/${site.assetsPath}/`,
				wikiLinkStyle: 'text', // Convert wiki-links to plain text (internal notes likely don't exist on Jekyll)
				assetPrefix: slug, // Prefix assets with post slug to ensure uniqueness
			});
			const { content, assets } = processor.process(rawContent);
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

			// Upload assets (images) referenced in the content
			for (const asset of assets) {
				const assetFile = await this.findAssetFile(asset.filename);
				if (assetFile) {
					const assetContent = await this.vault.readBinary(assetFile);
					const base64Content = this.arrayBufferToBase64(assetContent);
					await client.createOrUpdateFile(
						asset.targetPath,
						base64Content,
						`Add image: ${asset.filename}`,
						branchName,
						true // isBase64
					);
				} else {
					console.warn(`[GitHubWebPublish] Asset not found: ${asset.filename}`);
				}
			}

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
				assets,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { success: false, error: message };
		}
	}

	/**
	 * Find an asset file in the vault by filename
	 * Searches common attachment locations
	 */
	private async findAssetFile(filename: string): Promise<TFile | null> {
		// First, try the exact path if it looks like a path
		if (filename.includes('/')) {
			const file = this.vault.getAbstractFileByPath(filename);
			if (file && this.isTFile(file)) {
				return file;
			}
		}

		// Search all files for a matching name
		const allFiles = this.vault.getFiles();
		const matchingFile = allFiles.find(f =>
			f.name === filename ||
			f.path.endsWith(`/${filename}`)
		);

		return matchingFile ?? null;
	}

	/**
	 * Type guard to check if a file is a TFile
	 */
	private isTFile(file: TAbstractFile): file is TFile {
		return 'extension' in file;
	}

	/**
	 * Convert ArrayBuffer to base64 string
	 */
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		const chunks: string[] = [];
		// Process in chunks to avoid call stack issues with large files
		const chunkSize = 8192;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			const chunk = bytes.subarray(i, i + chunkSize);
			chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
		}
		return btoa(chunks.join(''));
	}

	/**
	 * Unpublish a file from GitHub
	 *
	 * @param file The file being unpublished
	 * @param site The site configuration
	 * @param deleteAssets If true, also delete associated assets
	 */
	async unpublish(file: TFile, site: SiteConfig, deleteAssets: boolean): Promise<UnpublishResult> {
		// Validate we have auth
		if (!this.settings.githubAuth?.token) {
			return { success: false, deletedFiles: [], error: 'Not authenticated with GitHub' };
		}

		// Parse owner/repo from site config
		const [owner, repo] = site.githubRepo.split('/');
		if (!owner || !repo) {
			return { success: false, deletedFiles: [], error: 'Invalid repository format. Expected owner/repo' };
		}

		// Create GitHub client
		const client = new GitHubClient({
			token: this.settings.githubAuth.token,
			owner,
			repo,
		});

		try {
			// Generate slug from filename
			const slug = slugify(file.basename);
			const branchName = `unpublish/${slug}`;

			// List files in _posts to find matching post
			const postsFiles = await client.listFiles(site.postsPath, site.baseBranch);

			// Find files matching the slug pattern (YYYY-MM-DD-slug.md or just slug.md)
			const matchingPosts = postsFiles.filter(f => {
				const nameWithoutExt = f.name.replace(/\.md$/, '');
				// Match exact slug or date-prefixed slug
				return nameWithoutExt === slug ||
					   nameWithoutExt.match(new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${slug}$`));
			});

			if (matchingPosts.length === 0) {
				return {
					success: false,
					deletedFiles: [],
					error: `No published post found matching "${slug}" in ${site.postsPath}/`
				};
			}

			// Create branch for unpublish
			await client.createBranch(branchName, site.baseBranch);

			const deletedFiles: string[] = [];

			// Delete matching post files
			for (const post of matchingPosts) {
				await client.deleteFile(
					post.path,
					`Remove post: ${post.name}`,
					branchName,
					post.sha
				);
				deletedFiles.push(post.path);
			}

			// Optionally delete associated assets
			if (deleteAssets) {
				try {
					const assetsFiles = await client.listFiles(site.assetsPath, branchName);
					// Find assets that start with the slug (our naming convention)
					const matchingAssets = assetsFiles.filter(f => f.name.startsWith(`${slug}-`));

					for (const asset of matchingAssets) {
						await client.deleteFile(
							asset.path,
							`Remove asset: ${asset.name}`,
							branchName,
							asset.sha
						);
						deletedFiles.push(asset.path);
					}
				} catch {
					// Assets directory might not exist or be empty, continue
					console.debug('[GitHubWebPublish] Could not list/delete assets, continuing');
				}
			}

			// Create PR
			const prTitle = `Unpublish: ${file.basename}`;
			const prBody = `Removing "${file.basename}" from ${site.name}.\n\nDeleted files:\n${deletedFiles.map(f => `- ${f}`).join('\n')}\n\nCreated by Obsidian GitHub Web Publish plugin.`;
			const pr = await client.createPullRequest(prTitle, branchName, site.baseBranch, prBody);

			// Merge immediately (unpublish is always immediate)
			await client.mergePullRequest(pr.number, prTitle);

			// Clean up branch
			try {
				await client.deleteBranch(branchName);
			} catch {
				// Branch deletion can fail if GitHub auto-deleted it
			}

			return {
				success: true,
				deletedFiles,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { success: false, deletedFiles: [], error: message };
		}
	}
}
