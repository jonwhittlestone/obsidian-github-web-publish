/**
 * Plugin settings tab
 * Provides UI for configuring GitHub authentication and site settings
 */

import { App, Notice, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import type GitHubWebPublishPlugin from '../main';
import type { SiteConfig } from './types';
import { performDeviceFlow, OAuthError } from '../github';
import { AuthModal, SiteConfigModal } from '../ui';

// Default OAuth Client ID - users can override with their own
// To use your own, create an OAuth App at github.com/settings/developers
// and enable Device Flow in the app settings
const DEFAULT_OAUTH_CLIENT_ID = 'Ov23li0xc9wjXMk49Tj4';

export class GitHubWebPublishSettingTab extends PluginSettingTab {
	plugin: GitHubWebPublishPlugin;

	constructor(app: App, plugin: GitHubWebPublishPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderGitHubAuthSection(containerEl);
		this.renderSiteConfigSection(containerEl);
		this.renderPublishingOptionsSection(containerEl);
		this.renderUnpublishOptionsSection(containerEl);
		this.renderActivityLogSection(containerEl);
	}

	private renderGitHubAuthSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('GitHub authentication').setHeading();

		const auth = this.plugin.settings.githubAuth;

		if (auth?.token) {
			// Already authenticated
			const tokenType = auth.tokenType === 'oauth' ? 'OAuth' : 'PAT';
			const statusEl = containerEl.createDiv({ cls: 'setting-item' });
			statusEl.createEl('div', {
				cls: 'setting-item-info',
			}).createEl('div', {
				cls: 'setting-item-name',
				text: `✅ Connected${auth.username ? ` as @${auth.username}` : ''} (${tokenType})`,
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
			// Not authenticated - show OAuth option first
			new Setting(containerEl)
				.setName('Connection status')
				.setDesc('Not connected. Login with GitHub or use a personal access token.');

			// OAuth Login button
			new Setting(containerEl)
				 
				.setName('Login with GitHub')
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setDesc('Recommended: Use OAuth Device Flow for easy authentication')
				.addButton(button => button
					.setButtonText('Login with GitHub')
					.setCta()
					.onClick(() => { void this.startOAuthFlow(); }));

			// Collapsible PAT section as alternative
			const patDetails = containerEl.createEl('details', { cls: 'github-publish-pat-section' });
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			patDetails.createEl('summary', { text: 'Or use a Personal Access Token' });

			let tokenValue = '';

			new Setting(patDetails)
				.setName('Personal access token')
				.setDesc('Create a token at github.com/settings/tokens with "repo" scope')
				.addText(text => text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder('ghp_xxxxxxxxxxxx')
					.setValue('')
					.onChange(value => {
						tokenValue = value;
					}))
				.addButton(button => button
					.setButtonText('Connect')
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
		}
	}

	/**
	 * Start the OAuth Device Flow
	 */
	private async startOAuthFlow(): Promise<void> {
		const clientId = this.plugin.settings.oauthClientId || DEFAULT_OAUTH_CLIENT_ID;

		if (!clientId) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice('OAuth Client ID not configured. Please use a Personal Access Token or set a Client ID in Advanced settings.');
			return;
		}

		const modal = new AuthModal(this.app, {
			onCancel: () => {
				// Modal handles cancellation internally
			},
		});
		modal.open();

		try {
			const { token, username } = await performDeviceFlow(
				clientId,
				(verification) => {
					modal.showVerification(
						verification.userCode,
						verification.verificationUri,
						verification.expiresIn
					);
				},
				() => modal.isCancelled()
			);

			// Save the token
			this.plugin.settings.githubAuth = {
				token,
				tokenType: 'oauth',
				username,
			};
			await this.plugin.saveSettings();

			modal.showSuccess(username);

			// Refresh display after a short delay
			setTimeout(() => {
				modal.close();
				this.display();
			}, 1500);

		} catch (error) {
			if (error instanceof OAuthError && error.code === 'cancelled') {
				// User cancelled, modal already closed
				return;
			}

			const message = error instanceof Error ? error.message : 'Unknown error';
			modal.showError(message);
		}
	}

	private renderSiteConfigSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Sites').setHeading();

		const sites = this.plugin.settings.sites;

		if (sites.length === 0) {
			// No sites configured
			const emptyState = containerEl.createDiv({ cls: 'github-publish-empty-sites' });
			emptyState.createEl('p', {
				text: 'No sites configured. Add a site to start publishing.',
				cls: 'setting-item-description',
			});
		} else {
			// List all configured sites
			for (const site of sites) {
				this.renderSiteCard(containerEl, site);
			}
		}

		// Add site button
		new Setting(containerEl)
			.addButton(button => button
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setButtonText('+ Add site')
				.onClick(() => {
					this.openSiteConfigModal(null);
				}));

		// Info note
		const infoEl = containerEl.createDiv({ cls: 'github-publish-info' });
		const infoText = infoEl.createEl('p', { cls: 'setting-item-description' });
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		infoText.setText('All operations use the GitHub API directly - no local git installation required.');
	}

	/**
	 * Render a single site card in the settings
	 */
	private renderSiteCard(containerEl: HTMLElement, site: SiteConfig): void {
		const siteCard = containerEl.createDiv({ cls: 'github-publish-site-card' });

		// Site info
		const infoDiv = siteCard.createDiv({ cls: 'github-publish-site-info' });

		// Site name with folder icon
		const nameEl = infoDiv.createDiv({ cls: 'github-publish-site-name' });
		nameEl.createSpan({ text: '📁 ' });
		nameEl.createSpan({ text: site.name || 'Untitled site' });

		// Vault path
		const vaultDetail = infoDiv.createDiv({ cls: 'github-publish-site-detail' });
		vaultDetail.setText(`Vault: ${site.vaultPath || '(not set)'}`);

		// GitHub repo
		const repoDetail = infoDiv.createDiv({ cls: 'github-publish-site-detail' });
		repoDetail.setText(`GitHub: ${site.githubRepo || '(not set)'} → ${site.baseBranch}`);

		// Buttons
		const buttonsDiv = siteCard.createDiv({ cls: 'github-publish-site-buttons' });

		// Configure button
		const configBtn = buttonsDiv.createEl('button', { text: 'Configure' });
		configBtn.addEventListener('click', () => { this.openSiteConfigModal(site); });

		// Create folders button
		const foldersBtn = buttonsDiv.createEl('button', { text: 'Create folders' });
		foldersBtn.addEventListener('click', () => { void this.handleCreateFolders(site, foldersBtn); });
	}

	/**
	 * Handle creating folder structure for a site
	 */
	private async handleCreateFolders(site: SiteConfig, button: HTMLButtonElement): Promise<void> {
		if (!site.vaultPath) {
			new Notice('Please set a vault path first');
			return;
		}

		button.disabled = true;
		button.textContent = 'Creating...';

		try {
			await this.createSiteFolders(site.vaultPath);
			new Notice(`Folder structure created for ${site.name}`);
		} catch (error) {
			new Notice(`Failed to create folders: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			button.disabled = false;
			button.textContent = 'Create folders';
		}
	}

	/**
	 * Open the site configuration modal for add/edit
	 */
	private openSiteConfigModal(site: SiteConfig | null): void {
		const modal = new SiteConfigModal(this.app, site, {
			onSave: async (updatedSite, isNew) => {
				if (isNew) {
					// Add new site
					this.plugin.settings.sites.push(updatedSite);
				} else {
					// Update existing site - find by vault path (unique identifier)
					const index = this.plugin.settings.sites.findIndex(
						s => s.vaultPath === site?.vaultPath
					);
					if (index !== -1) {
						this.plugin.settings.sites[index] = updatedSite;
					}
				}
				await this.plugin.saveSettings();
				this.display(); // Refresh the settings view
			},
			onDelete: async (siteToDelete) => {
				// Remove site by vault path
				this.plugin.settings.sites = this.plugin.settings.sites.filter(
					s => s.vaultPath !== siteToDelete.vaultPath
				);
				await this.plugin.saveSettings();
				new Notice(`Site "${siteToDelete.name}" removed`);
				this.display(); // Refresh the settings view
			},
		});
		modal.open();
	}

	private renderPublishingOptionsSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Publishing').setHeading();

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
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('Adds YYYY-MM-DD prefix when publishing (required for Jekyll)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.addDatePrefix)
				.onChange(async (value) => {
					this.plugin.settings.addDatePrefix = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Open pull request in browser')
			.setDesc('Open the GitHub pull request in your browser after creation')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openPrInBrowser)
				.onChange(async (value) => {
					this.plugin.settings.openPrInBrowser = value;
					await this.plugin.saveSettings();
				}));
	}

	private renderUnpublishOptionsSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Unpublishing').setHeading();

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
		new Setting(containerEl).setName('Activity log').setHeading();

		new Setting(containerEl)
			.setName('Activity log location')
			.setDesc('All publish/unpublish events are logged to _publish-log.md in each site folder.');
	}

	/**
	 * Create the folder structure for a site
	 */
	private async createSiteFolders(vaultPath: string): Promise<void> {
		const folders = [
			'unpublished',
			'ready-to-publish-scheduled',
			'ready-to-publish-now',
			'published',
		];

		for (const folder of folders) {
			const fullPath = `${vaultPath}/${folder}`;
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			if (!existing) {
				await this.app.vault.createFolder(fullPath);
			}
		}
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
