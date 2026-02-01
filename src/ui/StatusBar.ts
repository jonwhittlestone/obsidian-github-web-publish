/**
 * Status Bar - Shows publish status in Obsidian's status bar
 *
 * Displays:
 * - Authentication status (connected/not connected)
 * - Publishing progress (idle/publishing/success/error)
 */

import type { Plugin } from 'obsidian';

export type StatusBarState =
	| 'disconnected'
	| 'connected'
	| 'publishing'
	| 'success'
	| 'error';

interface StatusConfig {
	icon: string;
	text: string;
	tooltip: string;
}

const STATUS_CONFIG: Record<StatusBarState, StatusConfig> = {
	disconnected: {
		icon: '○',
		text: 'Not connected',
		tooltip: 'GitHub Web Publish: Not connected. Click to open settings.',
	},
	connected: {
		icon: '●',
		text: 'Ready',
		tooltip: 'GitHub Web Publish: Connected and ready.',
	},
	publishing: {
		icon: '◐',
		text: 'Publishing...',
		tooltip: 'GitHub Web Publish: Publishing in progress...',
	},
	success: {
		icon: '✓',
		text: 'Published',
		tooltip: 'GitHub Web Publish: Successfully published.',
	},
	error: {
		icon: '✗',
		text: 'Error',
		tooltip: 'GitHub Web Publish: An error occurred.',
	},
};

export class StatusBar {
	private statusBarEl: HTMLElement;
	private state: StatusBarState = 'disconnected';
	private onClick: (() => void) | null = null;
	private resetTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(plugin: Plugin) {
		this.statusBarEl = plugin.addStatusBarItem();
		this.statusBarEl.addClass('github-publish-status');
		this.statusBarEl.addEventListener('click', () => {
			this.onClick?.();
		});
		this.render();
	}

	/**
	 * Set the click handler
	 */
	setOnClick(handler: () => void): void {
		this.onClick = handler;
	}

	/**
	 * Update the status bar state
	 */
	setState(state: StatusBarState): void {
		this.state = state;
		this.render();

		// Auto-reset success/error states after 5 seconds
		if (state === 'success' || state === 'error') {
			if (this.resetTimeout) {
				clearTimeout(this.resetTimeout);
			}
			this.resetTimeout = setTimeout(() => {
				// Reset to connected state (assuming we're still authenticated)
				if (this.state === 'success' || this.state === 'error') {
					this.setState('connected');
				}
			}, 5000);
		}
	}

	/**
	 * Get the current state
	 */
	getState(): StatusBarState {
		return this.state;
	}

	/**
	 * Set connected/disconnected based on auth status
	 */
	setConnected(connected: boolean): void {
		if (this.state === 'publishing') {
			// Don't interrupt publishing state
			return;
		}
		this.setState(connected ? 'connected' : 'disconnected');
	}

	/**
	 * Render the status bar
	 */
	private render(): void {
		const config = STATUS_CONFIG[this.state];
		this.statusBarEl.empty();
		this.statusBarEl.setText(`${config.icon} ${config.text}`);
		this.statusBarEl.setAttr('aria-label', config.tooltip);
		this.statusBarEl.setAttr('data-tooltip-position', 'top');
	}

	/**
	 * Clean up
	 */
	destroy(): void {
		if (this.resetTimeout) {
			clearTimeout(this.resetTimeout);
		}
	}
}
