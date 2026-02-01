/**
 * GitHub Web Publish - Obsidian Plugin
 * Publish notes to Jekyll/GitHub Pages via PR workflow
 */

import { Notice, Plugin } from 'obsidian';
import {
	GitHubWebPublishSettingTab,
	DEFAULT_SETTINGS,
	PluginSettings,
} from './settings';

export default class GitHubWebPublishPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon
		this.addRibbonIcon('upload-cloud', 'GitHub Web Publish', () => {
			if (!this.settings.githubAuth?.token) {
				new Notice('Please configure GitHub authentication in settings');
				return;
			}
			new Notice('GitHub Web Publish: Ready');
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
				// @ts-expect-error - setting property exists but not in types
				this.app.setting.open();
				// @ts-expect-error - openTabById exists but not in types
				this.app.setting.openTabById(this.manifest.id);
			},
		});

		console.log('GitHub Web Publish plugin loaded');
	}

	onunload() {
		console.log('GitHub Web Publish plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
