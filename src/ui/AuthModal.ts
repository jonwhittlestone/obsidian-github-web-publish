/**
 * OAuth Authentication Modal
 *
 * Displays the user code and verification URL for the GitHub Device Flow.
 * User enters the code at github.com/login/device to authorize.
 */

import { App, Modal, Setting } from 'obsidian';

export interface AuthModalCallbacks {
	onOpen?: () => void;
	onCancel?: () => void;
}

export class AuthModal extends Modal {
	private userCode: string = '';
	private verificationUri: string = '';
	private expiresIn: number = 0;
	private statusEl: HTMLElement | null = null;
	private callbacks: AuthModalCallbacks;
	private cancelled: boolean = false;

	constructor(app: App, callbacks: AuthModalCallbacks = {}) {
		super(app);
		this.callbacks = callbacks;
	}

	/**
	 * Check if the modal was cancelled
	 */
	isCancelled(): boolean {
		return this.cancelled;
	}

	/**
	 * Update the modal with verification details
	 */
	showVerification(userCode: string, verificationUri: string, expiresIn: number): void {
		this.userCode = userCode;
		this.verificationUri = verificationUri;
		this.expiresIn = expiresIn;
		this.display();
	}

	/**
	 * Update status message
	 */
	setStatus(message: string): void {
		if (this.statusEl) {
			this.statusEl.setText(message);
		}
	}

	/**
	 * Show success state
	 */
	showSuccess(username: string): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Connected!' });
		contentEl.createEl('p', {
			text: `Successfully logged in as @${username}`,
			cls: 'github-publish-success',
		});

		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('Close')
				.setCta()
				.onClick(() => this.close()));
	}

	/**
	 * Show error state
	 */
	showError(message: string): void {
		const { contentEl } = this;
		contentEl.empty();

		// eslint-disable-next-line obsidianmd/ui/sentence-case
		contentEl.createEl('h2', { text: 'Authentication Failed' });
		contentEl.createEl('p', {
			text: message,
			cls: 'github-publish-error',
		});

		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('Close')
				.onClick(() => this.close()));
	}

	onOpen(): void {
		this.callbacks.onOpen?.();
		this.display();
	}

	private display(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('github-publish-auth-modal');

		if (!this.userCode) {
			// Initial loading state
			contentEl.createEl('h2', { text: 'Connecting to GitHub...' });
			contentEl.createEl('p', { text: 'Requesting authorization...' });
			return;
		}

		// Main content
		contentEl.createEl('h2', { text: 'Login with GitHub' });

		// Instructions
		const instructions = contentEl.createDiv({ cls: 'github-publish-instructions' });
		instructions.createEl('p', { text: '1. Copy this code:' });

		// User code display
		const codeContainer = contentEl.createDiv({ cls: 'github-publish-code-container' });
		codeContainer.createEl('code', {
			text: this.userCode,
			cls: 'github-publish-user-code',
		});

		// Copy button
		const copyButton = codeContainer.createEl('button', {
			text: 'Copy',
			cls: 'github-publish-copy-button',
		});
		copyButton.addEventListener('click', () => {
			void navigator.clipboard.writeText(this.userCode).then(() => {
				copyButton.setText('Copied!');
				setTimeout(() => copyButton.setText('Copy'), 2000);
			});
		});

		// Step 2
		instructions.createEl('p', { text: '2. Open this link and paste the code:' });

		// Verification link
		const linkContainer = contentEl.createDiv({ cls: 'github-publish-link-container' });
		const link = linkContainer.createEl('a', {
			text: this.verificationUri,
			href: this.verificationUri,
			cls: 'github-publish-verification-link',
		});
		link.setAttr('target', '_blank');

		new Setting(linkContainer)
			.addButton(button => button
				.setButtonText('Open GitHub')
				.setCta()
				.onClick(() => {
					window.open(this.verificationUri, '_blank');
				}));

		// Status
		this.statusEl = contentEl.createEl('p', {
			text: 'Waiting for authorization...',
			cls: 'github-publish-status',
		});

		// Expiry note
		const minutes = Math.floor(this.expiresIn / 60);
		contentEl.createEl('p', {
			text: `Code expires in ${minutes} minutes`,
			cls: 'github-publish-expiry',
		});

		// Cancel button
		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('Cancel')
				.onClick(() => {
					this.cancelled = true;
					this.callbacks.onCancel?.();
					this.close();
				}));
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
