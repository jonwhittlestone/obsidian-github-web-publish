/**
 * Plugin settings tab
 * Provides UI for configuring GitHub authentication and site settings
 */

import { App, Notice, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import type GitHubWebPublishPlugin from '../main';
import type { GitHubAuth } from './types';

export class GitHubWebPublishSettingTab extends PluginSettingTab {
	plugin: GitHubWebPublishPlugin;

	constructor(app: App, plugin: GitHubWebPublishPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h1', { text: 'GitHub Web Publish Settings' });

		this.renderGitHubAuthSection(containerEl);
		this.renderPublishingOptionsSection(containerEl);
		this.renderUnpublishOptionsSection(containerEl);
		this.renderActivityLogSection(containerEl);
	}

	private renderGitHubAuthSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'GitHub Authentication' });

		const auth = this.plugin.settings.githubAuth;

		if (auth?.token) {
			// Already authenticated
			const statusEl = containerEl.createDiv({ cls: 'setting-item' });
			statusEl.createEl('div', {
				cls: 'setting-item-info',
			}).createEl('div', {
				cls: 'setting-item-name',
				text: `✅ Connected${auth.username ? ` as @${auth.username}` : ''}`,
			});

			new Setting(containerEl)
				.setName('Disconnect')
				.setDesc('Remove stored GitHub token')
				.addButton(button => button
					.setButtonText('Logout')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.githubAuth = null;
						await this.plugin.saveSettings();
						new Notice('GitHub token removed');
						this.display();
					}));
		} else {
			// Not authenticated
			const statusEl = containerEl.createDiv({ cls: 'setting-item' });
			statusEl.createEl('div', {
				cls: 'setting-item-info',
			}).createEl('div', {
				cls: 'setting-item-name',
				text: '❌ Not connected',
			});

			containerEl.createEl('p', {
				text: 'Enter a GitHub Personal Access Token (PAT) with "repo" scope to enable publishing.',
				cls: 'setting-item-description',
			});

			const tokenInputContainer = containerEl.createDiv();
			let tokenValue = '';

			new Setting(tokenInputContainer)
				.setName('Personal Access Token')
				.setDesc('Create a token at github.com/settings/tokens with "repo" scope')
				.addText(text => text
					.setPlaceholder('ghp_xxxxxxxxxxxx')
					.setValue('')
					.onChange(value => {
						tokenValue = value;
					}))
				.addButton(button => button
					.setButtonText('Connect')
					.setCta()
					.onClick(async () => {
						if (!tokenValue || !tokenValue.startsWith('ghp_')) {
							new Notice('Please enter a valid GitHub token (starts with ghp_)');
							return;
						}

						button.setDisabled(true);
						button.setButtonText('Connecting...');

						try {
							const username = await this.validateAndGetUsername(tokenValue);

							this.plugin.settings.githubAuth = {
								token: tokenValue,
								tokenType: 'pat',
								username,
							};
							await this.plugin.saveSettings();

							new Notice(`Connected as @${username}`);
							this.display();
						} catch (error) {
							new Notice(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
							button.setDisabled(false);
							button.setButtonText('Connect');
						}
					}));

			// Help link
			containerEl.createEl('p', {
				cls: 'setting-item-description',
			}).createEl('a', {
				text: '📖 How to create a Personal Access Token',
				href: '#',
			}).onclick = (e) => {
				e.preventDefault();
				// Open the configuration guide in Obsidian
				new Notice('See configuration-guides/github-pat-setup.md in your vault');
			};
		}
	}

	private renderPublishingOptionsSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'Publishing Options' });

		new Setting(containerEl)
			.setName('Move to published/ after success')
			.setDesc('Automatically move files to the published/ directory after successful publish')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.moveAfterPublish)
				.onChange(async (value) => {
					this.plugin.settings.moveAfterPublish = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Add date prefix to filename')
			.setDesc('Prepend YYYY-MM-DD to filename when publishing (required for Jekyll)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.addDatePrefix)
				.onChange(async (value) => {
					this.plugin.settings.addDatePrefix = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Open PR in browser')
			.setDesc('Open the GitHub pull request in your browser after creation')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openPrInBrowser)
				.onChange(async (value) => {
					this.plugin.settings.openPrInBrowser = value;
					await this.plugin.saveSettings();
				}));
	}

	private renderUnpublishOptionsSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'Unpublish Options' });

		new Setting(containerEl)
			.setName('Delete assets when unpublishing')
			.setDesc('Remove associated images/files from the repository when unpublishing a post')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.deleteAssetsOnUnpublish)
				.onChange(async (value) => {
					this.plugin.settings.deleteAssetsOnUnpublish = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Confirm before unpublishing')
			.setDesc('Show a confirmation dialog before removing a post from your blog')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.confirmUnpublish)
				.onChange(async (value) => {
					this.plugin.settings.confirmUnpublish = value;
					await this.plugin.saveSettings();
				}));
	}

	private renderActivityLogSection(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'Activity Log' });

		new Setting(containerEl)
			.setName('Enable activity log')
			.setDesc('Write publish/unpublish events to _publish-log.md in each site folder')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableActivityLog)
				.onChange(async (value) => {
					this.plugin.settings.enableActivityLog = value;
					await this.plugin.saveSettings();
				}));
	}

	/**
	 * Validate the token by making a request to GitHub API
	 * Returns the authenticated username
	 */
	private async validateAndGetUsername(token: string): Promise<string> {
		const response = await requestUrl({
			url: 'https://api.github.com/user',
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});

		if (response.status !== 200) {
			throw new Error(`GitHub API returned status ${response.status}`);
		}

		const data = response.json as { login: string };
		if (!data.login) {
			throw new Error('Could not get username from GitHub');
		}

		return data.login;
	}
}
