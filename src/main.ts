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
import { FileWatcher, Publisher } from './publishing';
import { getUsername } from './github';
import { StatusBar } from './ui';
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
					new Notice(`Unpublishing: ${file.name} (not yet implemented)`);
				} else if (action.type === 'update') {
					new Notice(`Updating: ${file.name} (not yet implemented)`);
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
	 * Handle publishing a file to GitHub
	 */
	private async handlePublish(file: TFile, site: SiteConfig, immediate: boolean): Promise<void> {
		const actionType = immediate ? 'Publishing' : 'Scheduling';
		new Notice(`${actionType}: ${file.name}...`);

		// Update status bar
		this.statusBar.setState('publishing');

		const publisher = new Publisher(this.app.vault, this.settings);
		const result = await publisher.publish(file, site, immediate);

		if (result.success) {
			this.statusBar.setState('success');

			if (immediate) {
				new Notice(`Published: ${file.name}`);
			} else {
				new Notice(`Scheduled for publish: ${file.name}\nPR #${result.prNumber}`);
			}

			// Open PR in browser if setting enabled
			if (this.settings.openPrInBrowser && result.prUrl) {
				window.open(result.prUrl, '_blank');
			}
		} else {
			this.statusBar.setState('error');
			new Notice(`Failed to publish: ${result.error}`);
		}
	}
}
