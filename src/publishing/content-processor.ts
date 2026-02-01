/**
 * Content Processor - Transforms Obsidian content for Jekyll
 *
 * Handles:
 * - Wiki-link conversion ([[Page]] → standard markdown)
 * - Image embed conversion (![[image.png]] → ![](path))
 */

export interface ContentProcessorOptions {
	/** Base URL path for internal links (e.g., '/notes/') */
	linkBasePath: string;
	/** Base path for assets in the repo (e.g., '/assets/images/') */
	assetsBasePath: string;
	/** How to handle internal wiki-links: 'link' converts to markdown links, 'text' strips to plain text */
	wikiLinkStyle: 'link' | 'text';
	/** Prefix for asset filenames to ensure uniqueness (e.g., post slug) */
	assetPrefix?: string;
}

export interface ProcessedContent {
	/** The transformed content */
	content: string;
	/** List of referenced assets (images) that need to be uploaded */
	assets: AssetReference[];
}

export interface AssetReference {
	/** Original wiki-link reference (e.g., '![[image.png]]') */
	originalRef: string;
	/** Filename of the asset */
	filename: string;
	/** Target path in the repo (e.g., 'assets/images/image.png') */
	targetPath: string;
}

const DEFAULT_OPTIONS: ContentProcessorOptions = {
	linkBasePath: '/',
	assetsBasePath: '/assets/images/',
	wikiLinkStyle: 'text',
};

/**
 * Generate a URL-safe slug from text
 */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Get the filename without extension
 */
function getBasename(filename: string): string {
	const lastDot = filename.lastIndexOf('.');
	return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

/**
 * ContentProcessor transforms Obsidian markdown to Jekyll-compatible markdown
 */
export class ContentProcessor {
	private options: ContentProcessorOptions;

	constructor(options: Partial<ContentProcessorOptions> = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	/**
	 * Process content, converting wiki-links and collecting asset references
	 */
	process(content: string): ProcessedContent {
		const assets: AssetReference[] = [];

		// First, process image embeds (![[image.png]])
		let processed = this.processImageEmbeds(content, assets);

		// Then, process regular wiki-links ([[Page]] or [[Page|Display]])
		processed = this.processWikiLinks(processed);

		return { content: processed, assets };
	}

	/**
	 * Process image embeds: ![[image.png]] → ![alt](/assets/images/prefix-image.png)
	 */
	private processImageEmbeds(content: string, assets: AssetReference[]): string {
		// Match ![[filename]] or ![[filename|alt]]
		// Also handles paths like ![[folder/image.png]]
		const imageRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

		return content.replace(imageRegex, (match, filename: string, alt?: string) => {
			// Clean up the filename
			const cleanFilename = filename.trim();

			// Get just the filename part (in case of paths like "attachments/image.png")
			const filenameOnly = cleanFilename.split('/').pop() ?? cleanFilename;

			// Use alt text if provided, otherwise use filename without extension
			const altText = alt?.trim() || getBasename(filenameOnly);

			// Add prefix to filename to ensure uniqueness
			const uniqueFilename = this.options.assetPrefix
				? `${this.options.assetPrefix}-${filenameOnly}`
				: filenameOnly;

			// Build the target path
			const assetsBase = this.options.assetsBasePath.replace(/^\//, '').replace(/\/$/, '');
			const targetPath = `${assetsBase}/${uniqueFilename}`;

			// Track the asset for upload
			assets.push({
				originalRef: match,
				filename: cleanFilename,
				targetPath,
			});

			// Return standard markdown image
			return `![${altText}](/${targetPath})`;
		});
	}

	/**
	 * Process wiki-links: [[Page]] → [Page](/path) or just Page
	 */
	private processWikiLinks(content: string): string {
		// Match [[page]] or [[page|display text]]
		// Negative lookbehind (?<!!): don't match if preceded by ! (those are images)
		const wikiLinkRegex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

		return content.replace(wikiLinkRegex, (match, page: string, display?: string) => {
			const pageName = page.trim();
			const displayText = display?.trim() || pageName;

			if (this.options.wikiLinkStyle === 'text') {
				// Just return the display text (strip the wiki-link)
				return displayText;
			}

			// Convert to standard markdown link
			const slug = slugify(pageName);
			const linkPath = `${this.options.linkBasePath}${slug}`;
			return `[${displayText}](${linkPath})`;
		});
	}

	/**
	 * Update options
	 */
	setOptions(options: Partial<ContentProcessorOptions>): void {
		this.options = { ...this.options, ...options };
	}
}
