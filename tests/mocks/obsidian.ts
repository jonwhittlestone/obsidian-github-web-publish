/**
 * Mock implementations of Obsidian API for testing
 * These mocks allow unit tests to run without the Obsidian runtime
 */

export class Plugin {
	app: App;
	manifest: PluginManifest;

	constructor() {
		this.app = new App();
		this.manifest = {
			id: 'test-plugin',
			name: 'Test Plugin',
			version: '0.0.1',
			minAppVersion: '0.12.11',
			description: 'Test',
			author: 'Test',
			authorUrl: '',
			isDesktopOnly: false,
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	async loadData(): Promise<unknown> {
		return {};
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
	async saveData(_data: unknown): Promise<void> {}

	// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
	addSettingTab(_settingTab: PluginSettingTab): void {}

	// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
	registerEvent(_event: unknown): void {}

	// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
	addCommand(_command: unknown): void {}

	// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
	addRibbonIcon(_icon: string, _title: string, _callback: () => void): void {}
}

export class App {
	vault: Vault;
	workspace: Workspace;

	constructor() {
		this.vault = new Vault();
		this.workspace = new Workspace();
	}
}

export class Vault {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async read(_file: TFile): Promise<string> {
		return '';
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async modify(_file: TFile, _content: string): Promise<void> {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	on(_event: string, _callback: (...args: unknown[]) => void): EventRef {
		return { id: 'mock-event' } as EventRef;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	getAbstractFileByPath(_path: string): TAbstractFile | null {
		return null;
	}
}

export class Workspace {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	on(_event: string, _callback: (...args: unknown[]) => void): EventRef {
		return { id: 'mock-event' } as EventRef;
	}

	getActiveFile(): TFile | null {
		return null;
	}
}

export class PluginSettingTab {
	app: App;
	containerEl: HTMLElement;

	constructor(app: App, _plugin: Plugin) {
		this.app = app;
		this.containerEl = document.createElement('div');
	}

	display(): void {}
	hide(): void {}
}

export class Modal {
	app: App;
	contentEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.contentEl = document.createElement('div');
	}

	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class Setting {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_containerEl: HTMLElement) {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	setName(_name: string): this {
		return this;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	setDesc(_desc: string): this {
		return this;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	addText(_cb: (text: TextComponent) => void): this {
		return this;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	addToggle(_cb: (toggle: ToggleComponent) => void): this {
		return this;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	addButton(_cb: (button: ButtonComponent) => void): this {
		return this;
	}
}

export class Notice {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_message: string, _timeout?: number) {}
}

// Mock requestUrl for HTTP requests
export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface RequestUrlResponse {
	status: number;
	headers: Record<string, string>;
	text: string;
	json: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function requestUrl(_params: RequestUrlParam): Promise<RequestUrlResponse> {
	return {
		status: 200,
		headers: {},
		text: '',
		json: {},
	};
}

// Type definitions
export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	minAppVersion: string;
	description: string;
	author: string;
	authorUrl: string;
	isDesktopOnly: boolean;
}

export interface TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
}

export interface TAbstractFile {
	path: string;
	name: string;
}

export interface EventRef {
	id: string;
}

export interface TextComponent {
	setValue(value: string): this;
	onChange(callback: (value: string) => void): this;
}

export interface ToggleComponent {
	setValue(value: boolean): this;
	onChange(callback: (value: boolean) => void): this;
}

export interface ButtonComponent {
	setButtonText(text: string): this;
	setCta(): this;
	onClick(callback: () => void): this;
}
