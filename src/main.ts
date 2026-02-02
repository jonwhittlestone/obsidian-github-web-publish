/**
 * GitHub Web Publish - Obsidian Plugin
 * Publish notes to Jekyll/GitHub Pages via PR workflow
 */

import { Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import {
	GitHubWebPublishSettingTab,
	DEFAULT_SETTINGS,
	PluginSettings,
} from './settings';
import { FileWatcher, Publisher, SITE_FOLDERS } from './publishing';
import { getUsername } from './github';
import { StatusBar } from './ui';
import { ActivityLog } from './logging';
import type { SiteConfig } from './settings/types';

/**
 * Extended App interface to include the settings modal
 * These methods exist at runtime but are not in the public API types
 */
interface AppWithSettings {
	setting: {
		open(): void;
		openTabById(id: string): void;
	};
}

export default class GitHubWebPublishPlugin extends Plugin {
	settings: PluginSettings;
	private fileWatcher: FileWatcher;
	private statusBar: StatusBar;

	async onload() {
		await this.loadSettings();

		// Initialize file watcher
		this.fileWatcher = new FileWatcher(this);

		// Initialize status bar
		this.statusBar = new StatusBar(this);
		this.statusBar.setConnected(this.isAuthenticated());
		this.statusBar.setOnClick(() => {
			// Open settings when clicked
			const appWithSettings = this.app as unknown as AppWithSettings;
			appWithSettings.setting.open();
			appWithSettings.setting.openTabById(this.manifest.id);
		});

		// Register file rename event listener
		// Key: We ONLY listen to 'rename' events, NOT 'create' events.
		// This provides sync protection because Dropbox/iCloud sync
		// creates files (appears as 'create'), while user moves are 'rename'.
		this.registerEvent(
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				const action = this.fileWatcher.handleFileMove(file, oldPath);

				// Handle publish actions
				if (action.type === 'schedule-publish' || action.type === 'immediate-publish') {
					void this.handlePublish(
						action.file,
						action.site,
						action.type === 'immediate-publish'
					);
				} else if (action.type === 'unpublish') {
					void this.handleUnpublish(action.file, action.site);
				} else if (action.type === 'update') {
					void this.handleUpdate(
						action.file,
						action.site,
						action.immediate
					);
				}
			})
		);

		// Add ribbon icon
		this.addRibbonIcon('upload-cloud', 'GitHub web publish', () => {
			if (!this.settings.githubAuth?.token) {
				new Notice('Please configure GitHub authentication in settings');
				return;
			}
			new Notice('GitHub web publish: ready');
		});

		// Add settings tab
		this.addSettingTab(new GitHubWebPublishSettingTab(this.app, this));

		// Validate token on startup (non-blocking)
		if (this.settings.githubAuth?.token) {
			void this.validateToken();
		}

		// Register commands
		this.addCommand({
			id: 'publish-current-note',
			name: 'Publish current note',
			checkCallback: (checking: boolean) => {
				if (!this.settings.githubAuth?.token) {
					return false;
				}
				if (!checking) {
					new Notice('Publish functionality coming in next phase');
				}
				return true;
			},
		});

		this.addCommand({
			id: 'open-settings',
			name: 'Open settings',
			callback: () => {
				const appWithSettings = this.app as unknown as AppWithSettings;
				appWithSettings.setting.open();
				appWithSettings.setting.openTabById(this.manifest.id);
			},
		});

		this.addCommand({
			id: 'view-activity-log',
			name: 'View activity log',
			callback: () => {
				void this.openActivityLog();
			},
		});

		// Plugin loaded successfully
	}

	onunload() {
		this.statusBar.destroy();
	}

	async loadSettings() {
		const data = await this.loadData() as Partial<PluginSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Check if the plugin is authenticated with GitHub
	 */
	isAuthenticated(): boolean {
		return !!this.settings.githubAuth?.token;
	}

	/**
	 * Get the current GitHub username if authenticated
	 */
	getGitHubUsername(): string | undefined {
		return this.settings.githubAuth?.username;
	}

	/**
	 * Validate the stored token on startup
	 * If invalid, clear it and notify the user
	 */
	private async validateToken(): Promise<void> {
		const token = this.settings.githubAuth?.token;
		if (!token) return;

		try {
			// Try to get the username - this validates the token
			const username = await getUsername(token);

			// Update username if it changed or wasn't stored
			if (this.settings.githubAuth && this.settings.githubAuth.username !== username) {
				this.settings.githubAuth.username = username;
				await this.saveSettings();
			}

			// Update status bar
			this.statusBar.setConnected(true);
		} catch {
			// Token is invalid - clear it
			this.settings.githubAuth = null;
			await this.saveSettings();
			this.statusBar.setConnected(false);
			new Notice('GitHub session expired. Please login again in settings.');
		}
	}

	/**
	 * Open the activity log for the first configured site
	 */
	private async openActivityLog(): Promise<void> {
		const site = this.settings.sites[0];
		if (!site?.vaultPath) {
			new Notice('No site configured. Please configure a site in settings first.');
			return;
		}

		const logPath = `${site.vaultPath}/_publish-log.md`;
		let file = this.app.vault.getAbstractFileByPath(logPath);

		if (!file) {
			// Create the log file if it doesn't exist
			const log = new ActivityLog(this.app.vault, site.vaultPath);
			await log.log({
				status: 'warning',
				postTitle: 'Activity Log',
				filename: '_publish-log.md',
				details: 'Log file created',
			});
			file = this.app.vault.getAbstractFileByPath(logPath);
		}

		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
	}

	/**
	 * Move a file back to the unpublished folder
	 * Used when validation fails to allow the user to correct mistakes
	 */
	private async moveToUnpublished(file: TFile, site: SiteConfig): Promise<void> {
		const unpublishedPath = `${site.vaultPath}/unpublished/${file.name}`;
		try {
			await this.app.fileManager.renameFile(file, unpublishedPath);
		} catch (e) {
			console.error('[GitHubWebPublish] Failed to move file to unpublished:', e);
		}
	}

	/**
	 * Move a file to the published folder after successful publish
	 */
	private async moveToPublished(file: TFile, site: SiteConfig): Promise<void> {
		const publishedPath = `${site.vaultPath}/published/${file.name}`;
		try {
			await this.app.fileManager.renameFile(file, publishedPath);
		} catch (e) {
			console.error('[GitHubWebPublish] Failed to move file to published:', e);
		}
	}

	/**
	 * Handle publishing a file to GitHub
	 */
	private async handlePublish(file: TFile, site: SiteConfig, immediate: boolean): Promise<void> {
		const actionType = immediate ? 'Publishing' : 'Scheduling';
		new Notice(`${actionType}: ${file.name}...`);

		// Update status bar
		this.statusBar.setState('publishing');

		const publisher = new Publisher(this.app.vault, this.settings);
		const result = await publisher.publish(file, site, immediate);

		// Log to activity log
		const log = new ActivityLog(this.app.vault, site.vaultPath);
		// Determine log status - distinguish validation failures from other errors
		let logStatus: 'published' | 'queued' | 'failed' | 'validation';
		if (result.success) {
			logStatus = immediate ? 'published' : 'queued';
		} else if (result.validationResult && !result.validationResult.valid) {
			logStatus = 'validation';
		} else {
			logStatus = 'failed';
		}

		await log.log({
			status: logStatus,
			postTitle: file.basename,
			filename: file.name,
			prNumber: result.prNumber,
			prUrl: result.prUrl,
			liveUrl: result.liveUrl,
			error: result.error,
		});

		if (result.success) {
			this.statusBar.setState('success');

			if (immediate) {
				new Notice(`Published: ${file.name}`);
			} else {
				new Notice(`Scheduled for publish: ${file.name}\nPR #${result.prNumber}`);
			}

			// Move to published/ if setting enabled
			if (this.settings.moveAfterPublish) {
				await this.moveToPublished(file, site);
			}

			// Open PR in browser if setting enabled
			if (this.settings.openPrInBrowser && result.prUrl) {
				window.open(result.prUrl, '_blank');
			}
		} else {
			this.statusBar.setState('error');

			// On validation failure, move file back to unpublished folder
			if (result.validationResult && !result.validationResult.valid) {
				await this.moveToUnpublished(file, site);

				// Log the move back to unpublished
				const moveLog = new ActivityLog(this.app.vault, site.vaultPath);
				await moveLog.log({
					status: 'warning',
					postTitle: file.basename,
					filename: file.name,
					details: 'Moved back to unpublished/ due to validation failure',
				});

				new Notice(`Validation failed: ${file.name} moved back to unpublished.\n\n${result.error}`);
			} else {
				new Notice(`Failed to publish: ${result.error}`);
			}
		}
	}

	/**
	 * Handle unpublishing a file from GitHub
	 */
	private async handleUnpublish(file: TFile, site: SiteConfig): Promise<void> {
		new Notice(`Unpublishing: ${file.name}...`);

		// Update status bar
		this.statusBar.setState('publishing');

		const publisher = new Publisher(this.app.vault, this.settings);
		const result = await publisher.unpublish(
			file,
			site,
			this.settings.deleteAssetsOnUnpublish
		);

		// Log to activity log
		const log = new ActivityLog(this.app.vault, site.vaultPath);
		await log.log({
			status: result.success ? 'unpublished' : 'failed',
			postTitle: file.basename,
			filename: file.name,
			details: result.success
				? `Deleted: ${result.deletedFiles.join(', ')}`
				: undefined,
			error: result.error,
		});

		if (result.success) {
			this.statusBar.setState('success');
			new Notice(`Unpublished: ${file.name}\nDeleted ${result.deletedFiles.length} file(s)`);
		} else {
			this.statusBar.setState('error');
			new Notice(`Failed to unpublish: ${result.error}`);
		}
	}

	/**
	 * Handle updating an already-published file
	 */
	private async handleUpdate(file: TFile, site: SiteConfig, immediate: boolean): Promise<void> {
		new Notice(`Updating: ${file.name}...`);

		// Update status bar
		this.statusBar.setState('publishing');

		const publisher = new Publisher(this.app.vault, this.settings);
		const result = await publisher.update(file, site, immediate);

		// Log to activity log
		const log = new ActivityLog(this.app.vault, site.vaultPath);

		if (result.success) {
			if (immediate) {
				await log.log({
					status: 'published',
					postTitle: file.basename,
					filename: file.name,
					liveUrl: result.liveUrl,
					prNumber: result.prNumber,
					prUrl: result.prUrl,
					details: 'Updated',
				});

				// Move to published/ folder
				await this.moveToPublished(file, site);

				this.statusBar.setState('success');
				new Notice(`Updated: ${file.name}`);

				// Open PR if configured
				if (this.settings.openPrInBrowser && result.prUrl) {
					window.open(result.prUrl);
				}
			} else {
				await log.log({
					status: 'queued',
					postTitle: file.basename,
					filename: file.name,
					prNumber: result.prNumber,
					prUrl: result.prUrl,
					details: 'Update queued',
				});

				this.statusBar.setState('success');
				new Notice(`Update queued: ${file.name}\nPR #${result.prNumber} awaiting merge`);

				// Open PR if configured
				if (this.settings.openPrInBrowser && result.prUrl) {
					window.open(result.prUrl);
				}
			}
		} else {
			// Log failure
			await log.log({
				status: 'failed',
				postTitle: file.basename,
				filename: file.name,
				error: result.error,
			});

			this.statusBar.setState('error');
			new Notice(`Failed to update: ${result.error}`);

			// Move back to published/ folder on failure
			if (this.settings.moveAfterPublish) {
				const publishedPath = `${site.vaultPath}/${SITE_FOLDERS.PUBLISHED}/${file.name}`;
				try {
					await this.app.vault.rename(file, publishedPath);

					// Log warning
					await log.log({
						status: 'warning',
						postTitle: file.basename,
						filename: file.name,
						details: 'Moved back to published/ due to update failure',
					});
				} catch {
					// Ignore errors when moving back
				}
			}
		}
	}
}
