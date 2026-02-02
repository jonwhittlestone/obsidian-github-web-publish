/**
 * File Watcher - Detects file moves between publish folders
 *
 * Key design: Only responds to 'rename' events, NOT 'create' events.
 * This provides sync protection because Dropbox/iCloud sync operations
 * appear as 'create' events, not 'rename' events.
 */

import type { TAbstractFile, TFile } from 'obsidian';
import type GitHubWebPublishPlugin from '../main';
import type { SiteConfig } from '../settings/types';

/**
 * Type guard to check if a TAbstractFile is a TFile (has extension property)
 */
function isTFile(file: TAbstractFile): file is TFile {
	// Check for extension property existence without casting
	// eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
	return 'extension' in file && typeof (file as TFile).extension === 'string';
}

/** Folder names within a site's vault path */
export const SITE_FOLDERS = {
	UNPUBLISHED: 'unpublished',
	READY_TO_PUBLISH_SCHEDULED: 'ready-to-publish-scheduled',
	READY_TO_PUBLISH_NOW: 'ready-to-publish-now',
	PUBLISHED: 'published',
} as const;

/** Actions that can be triggered by file moves */
export type PublishAction =
	| { type: 'schedule-publish'; file: TFile; site: SiteConfig }
	| { type: 'immediate-publish'; file: TFile; site: SiteConfig }
	| { type: 'unpublish'; file: TFile; site: SiteConfig }
	| { type: 'withdraw'; file: TFile; site: SiteConfig }
	| { type: 'update'; file: TFile; site: SiteConfig; immediate: boolean }
	| { type: 'none' };

/**
 * Determines which site folder a path belongs to
 */
function getSiteFolder(
	path: string,
	siteVaultPath: string
): keyof typeof SITE_FOLDERS | null {
	const relativePath = path.startsWith(siteVaultPath + '/')
		? path.slice(siteVaultPath.length + 1)
		: null;

	if (!relativePath) return null;

	const firstSegment = relativePath.split('/')[0];

	if (firstSegment === SITE_FOLDERS.UNPUBLISHED) return 'UNPUBLISHED';
	if (firstSegment === SITE_FOLDERS.READY_TO_PUBLISH_SCHEDULED) return 'READY_TO_PUBLISH_SCHEDULED';
	if (firstSegment === SITE_FOLDERS.READY_TO_PUBLISH_NOW) return 'READY_TO_PUBLISH_NOW';
	if (firstSegment === SITE_FOLDERS.PUBLISHED) return 'PUBLISHED';

	return null;
}

/**
 * Finds which site config a path belongs to
 */
function findSiteForPath(
	path: string,
	sites: SiteConfig[]
): SiteConfig | null {
	for (const site of sites) {
		if (path.startsWith(site.vaultPath + '/') || path === site.vaultPath) {
			return site;
		}
	}
	return null;
}

/**
 * FileWatcher handles file rename events and determines publish actions.
 *
 * Sync Protection: By only listening to 'rename' events (not 'create'),
 * we automatically ignore files that appear via Dropbox/iCloud sync.
 * When Dropbox syncs a file, it appears as a 'create' event.
 * When a user manually moves a file, it's a 'rename' event.
 */
export class FileWatcher {
	private plugin: GitHubWebPublishPlugin;

	constructor(plugin: GitHubWebPublishPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Handle a file move/rename event.
	 * Called by the plugin's registered vault.on('rename') listener.
	 *
	 * @param file The file after the rename
	 * @param oldPath The path before the rename
	 */
	handleFileMove(file: TAbstractFile, oldPath: string): PublishAction {
		// Only process markdown files (use type guard instead of instanceof for testability)
		if (!isTFile(file) || file.extension !== 'md') {
			return { type: 'none' };
		}

		const sites = this.plugin.settings.sites;
		if (sites.length === 0) {
			return { type: 'none' };
		}

		// Find which site the OLD path belongs to (this is the key for sync protection)
		const oldSite = findSiteForPath(oldPath, sites);
		const newSite = findSiteForPath(file.path, sites);

		// If old path wasn't in a site, ignore (could be sync creating file)
		if (!oldSite) {
			return { type: 'none' };
		}

		// Get the folder types
		const oldFolder = getSiteFolder(oldPath, oldSite.vaultPath);
		const newFolder = newSite ? getSiteFolder(file.path, newSite.vaultPath) : null;

		// Determine the action based on folder transition
		const action = this.determineAction(file, oldSite, oldFolder, newFolder);

		// Log the action for debugging (will be replaced with actual publishing later)
		if (action.type !== 'none') {
			console.debug(`[GitHubWebPublish] File move detected:`, {
				oldPath,
				newPath: file.path,
				oldFolder,
				newFolder,
				action: action.type,
			});
		}

		return action;
	}

	/**
	 * Determine what publish action to take based on folder transition
	 */
	private determineAction(
		file: TFile,
		site: SiteConfig,
		oldFolder: keyof typeof SITE_FOLDERS | null,
		newFolder: keyof typeof SITE_FOLDERS | null
	): PublishAction {
		// No action if not moving between tracked folders
		if (!oldFolder || !newFolder) {
			return { type: 'none' };
		}

		// Move from published to ready-to-publish-scheduled(-now) → update (re-publish)
		// Check this BEFORE the general publish cases
		if (oldFolder === 'PUBLISHED') {
			if (newFolder === 'READY_TO_PUBLISH_SCHEDULED') {
				return { type: 'update', file, site, immediate: false };
			}
			if (newFolder === 'READY_TO_PUBLISH_NOW') {
				return { type: 'update', file, site, immediate: true };
			}
			if (newFolder === 'UNPUBLISHED') {
				return { type: 'unpublish', file, site };
			}
		}

		// Move from ready-to-publish-scheduled to unpublished → withdraw (cancel pending PR)
		if (oldFolder === 'READY_TO_PUBLISH_SCHEDULED' && newFolder === 'UNPUBLISHED') {
			return { type: 'withdraw', file, site };
		}

		// Move to ready-to-publish-scheduled → schedule publish
		if (newFolder === 'READY_TO_PUBLISH_SCHEDULED') {
			return { type: 'schedule-publish', file, site };
		}

		// Move to ready-to-publish-now → immediate publish
		if (newFolder === 'READY_TO_PUBLISH_NOW') {
			return { type: 'immediate-publish', file, site };
		}

		return { type: 'none' };
	}
}
