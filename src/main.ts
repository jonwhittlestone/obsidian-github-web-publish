/**
 * GitHub Web Publish - Obsidian Plugin
 * Publish notes to Jekyll/GitHub Pages via PR workflow
 */

import { Notice, Plugin, TAbstractFile } from 'obsidian';
import {
	GitHubWebPublishSettingTab,
	DEFAULT_SETTINGS,
	PluginSettings,
} from './settings';
import { FileWatcher } from './publishing';

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

	async onload() {
		await this.loadSettings();

		// Initialize file watcher
		this.fileWatcher = new FileWatcher(this);

		// Register file rename event listener
		// Key: We ONLY listen to 'rename' events, NOT 'create' events.
		// This provides sync protection because Dropbox/iCloud sync
		// creates files (appears as 'create'), while user moves are 'rename'.
		this.registerEvent(
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				const action = this.fileWatcher.handleFileMove(file, oldPath);

				// Notify user of detected actions (actual publishing comes later)
				if (action.type === 'schedule-publish') {
					new Notice(`Queued for scheduled publish: ${file.name}`);
				} else if (action.type === 'immediate-publish') {
					new Notice(`Publishing immediately: ${file.name}`);
				} else if (action.type === 'unpublish') {
					new Notice(`Unpublishing: ${file.name}`);
				} else if (action.type === 'update') {
					new Notice(`Updating published post: ${file.name}`);
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
		// Plugin unloaded
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
}
