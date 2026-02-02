/**
 * Site Configuration Modal
 *
 * Modal dialog for adding/editing site configurations.
 * Used when clicking "Add Site" or "Configure" in settings.
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import type { SiteConfig } from '../settings/types';

export interface SiteConfigModalCallbacks {
	onSave: (site: SiteConfig, isNew: boolean) => Promise<void>;
	onDelete?: (site: SiteConfig) => Promise<void>;
}

/**
 * Create a default empty site configuration
 */
export function createDefaultSiteConfig(): SiteConfig {
	return {
		name: '',
		githubRepo: '',
		baseBranch: 'main',
		postsPath: '_posts',
		assetsPath: 'assets/images',
		scheduledLabel: 'ready-to-publish',
		vaultPath: '',
		siteBaseUrl: '',
	};
}

export class SiteConfigModal extends Modal {
	private site: SiteConfig;
	private isNew: boolean;
	private callbacks: SiteConfigModalCallbacks;
	private hasChanges: boolean = false;

	constructor(
		app: App,
		site: SiteConfig | null,
		callbacks: SiteConfigModalCallbacks
	) {
		super(app);
		this.isNew = site === null;
		this.site = site ? { ...site } : createDefaultSiteConfig();
		this.callbacks = callbacks;
	}

	onOpen(): void {
		this.display();
	}

	private display(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('github-publish-site-modal');

		// Title
		const title = this.isNew ? 'Add site' : `Configure: ${this.site.name || 'Untitled'}`;
		contentEl.createEl('h2', { text: title });

		// Site name
		new Setting(contentEl)
			.setName('Site name')
			.setDesc('Display name for this site')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('My Blog')
				.setValue(this.site.name)
				.onChange(value => {
					this.site.name = value;
					this.hasChanges = true;
				}));

		// Vault path
		new Setting(contentEl)
			.setName('Vault path')
			.setDesc('Path in your vault for this site (contains unpublished/, ready-to-publish-scheduled/, etc.)')
			.addText(text => text
				.setPlaceholder('_www/sites/my-blog')
				.setValue(this.site.vaultPath)
				.onChange(value => {
					this.site.vaultPath = value;
					this.hasChanges = true;
				}));

		// Divider - Remote GitHub Repository
		const remoteSection = contentEl.createDiv({ cls: 'github-publish-section' });
		const remoteTitle = remoteSection.createEl('h4');
		remoteTitle.setText('Remote GitHub repository');
		const remoteDesc = remoteSection.createEl('p', { cls: 'setting-item-description' });
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		remoteDesc.setText('We connect via the GitHub API - no local git checkout needed.');

		// GitHub repository
		new Setting(contentEl)
			.setName('Repository')
			.setDesc('Format: owner/repo')
			.addText(text => {
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				text.inputEl.placeholder = 'owner/repo';
				text.setValue(this.site.githubRepo);
				text.onChange(value => {
					this.site.githubRepo = value;
					this.hasChanges = true;
				});
			});

		// Base branch
		new Setting(contentEl)
			.setName('Target branch')
			.setDesc('Pull requests will merge into this branch')
			.addText(text => {
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				text.inputEl.placeholder = 'main';
				text.setValue(this.site.baseBranch);
				text.onChange(value => {
					this.site.baseBranch = value;
					this.hasChanges = true;
				});
			});

		// Site base URL
		new Setting(contentEl)
			.setName('Site URL')
			.setDesc('Base URL of your published site (for activity log links)')
			.addText(text => {
				text.inputEl.placeholder = 'https://username.github.io/blog';
				text.setValue(this.site.siteBaseUrl || '');
				text.onChange(value => {
					this.site.siteBaseUrl = value;
					this.hasChanges = true;
				});
			});

		// Collapsible advanced settings
		const advancedDetails = contentEl.createEl('details', { cls: 'github-publish-advanced' });
		advancedDetails.createEl('summary', { text: 'Advanced settings' });

		new Setting(advancedDetails)
			.setName('Posts path')
			.setDesc('Path to posts directory in the repository')
			.addText(text => text
				.setPlaceholder('_posts')
				.setValue(this.site.postsPath)
				.onChange(value => {
					this.site.postsPath = value;
					this.hasChanges = true;
				}));

		new Setting(advancedDetails)
			.setName('Assets path')
			.setDesc('Path to assets directory in the repository')
			.addText(text => {
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				text.inputEl.placeholder = 'assets/images';
				text.setValue(this.site.assetsPath);
				text.onChange(value => {
					this.site.assetsPath = value;
					this.hasChanges = true;
				});
			});

		new Setting(advancedDetails)
			.setName('Scheduled publish label')
			.setDesc('Label for scheduled publish pull requests')
			.addText(text => {
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				text.inputEl.placeholder = 'ready-to-publish';
				text.setValue(this.site.scheduledLabel);
				text.onChange(value => {
					this.site.scheduledLabel = value;
					this.hasChanges = true;
				});
			});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'github-publish-modal-buttons' });

		// Delete button (only for existing sites)
		if (!this.isNew && this.callbacks.onDelete) {
			const deleteButton = buttonContainer.createEl('button', {
				text: 'Delete site',
				cls: 'mod-warning',
			});
			deleteButton.addEventListener('click', () => {
				void this.handleDelete();
			});
		}

		// Spacer
		buttonContainer.createDiv({ cls: 'github-publish-modal-spacer' });

		// Cancel button
		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());

		// Save button
		const saveButton = buttonContainer.createEl('button', {
			text: 'Save',
			cls: 'mod-cta',
		});
		saveButton.addEventListener('click', () => {
			void this.handleSave();
		});
	}

	private async handleSave(): Promise<void> {
		// Validate required fields
		if (!this.site.name.trim()) {
			new Notice('Site name is required');
			return;
		}

		if (!this.site.vaultPath.trim()) {
			new Notice('Vault path is required');
			return;
		}

		if (!this.site.githubRepo.trim()) {
			new Notice('GitHub repository is required');
			return;
		}

		// Validate repo format
		const repoParts = this.site.githubRepo.split('/');
		if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
			new Notice('Repository must be in owner/repo format');
			return;
		}

		try {
			await this.callbacks.onSave(this.site, this.isNew);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Failed to save: ${message}`);
		}
	}

	private async handleDelete(): Promise<void> {
		if (!this.callbacks.onDelete) return;

		// Show confirmation by updating modal content
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Delete site?' });
		contentEl.createEl('p', {
			text: `Are you sure you want to delete "${this.site.name}"?`,
		});
		contentEl.createEl('p', {
			text: 'This will remove the site configuration but won\'t delete any files from your vault.',
			cls: 'setting-item-description',
		});

		const buttonContainer = contentEl.createDiv({ cls: 'github-publish-modal-buttons' });
		buttonContainer.createDiv({ cls: 'github-publish-modal-spacer' });

		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.display());

		const deleteButton = buttonContainer.createEl('button', {
			text: 'Delete',
			cls: 'mod-warning',
		});
		deleteButton.addEventListener('click', () => { void this.confirmDelete(); });
	}

	/**
	 * Execute the delete after confirmation
	 */
	private async confirmDelete(): Promise<void> {
		try {
			await this.callbacks.onDelete!(this.site);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Failed to delete: ${message}`);
			this.display();
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
