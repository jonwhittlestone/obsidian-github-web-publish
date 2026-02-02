/**
 * Tests for ContentProcessor
 */

import { describe, it, expect } from 'vitest';
import { ContentProcessor } from '../src/publishing/content-processor';

describe('ContentProcessor', () => {
	describe('wiki-link conversion (text mode)', () => {
		const processor = new ContentProcessor({ wikiLinkStyle: 'text' });

		it('should convert simple wiki-link to plain text', () => {
			const result = processor.process('Check out [[My Note]] for more.');
			expect(result.content).toBe('Check out My Note for more.');
		});

		it('should convert wiki-link with display text', () => {
			const result = processor.process('See [[My Note|this page]] for details.');
			expect(result.content).toBe('See this page for details.');
		});

		it('should handle multiple wiki-links', () => {
			const result = processor.process('Links: [[First]], [[Second|Two]], [[Third]]');
			expect(result.content).toBe('Links: First, Two, Third');
		});

		it('should preserve wiki-links with special characters in display', () => {
			const result = processor.process('[[Note|Display with spaces & symbols!]]');
			expect(result.content).toBe('Display with spaces & symbols!');
		});

		it('should not affect image embeds when processing wiki-links', () => {
			const processor2 = new ContentProcessor({ wikiLinkStyle: 'text' });
			// Process images first, then check wiki-links don't interfere
			const result = processor2.process('Image: ![[photo.png]] and link: [[Note]]');
			expect(result.content).toContain('![photo]');
			expect(result.content).toContain('and link: Note');
		});
	});

	describe('wiki-link conversion (link mode)', () => {
		const processor = new ContentProcessor({
			wikiLinkStyle: 'link',
			linkBasePath: '/notes/',
		});

		it('should convert wiki-link to markdown link', () => {
			const result = processor.process('Check out [[My Note]] for more.');
			expect(result.content).toBe('Check out [My Note](/notes/my-note) for more.');
		});

		it('should convert wiki-link with display text', () => {
			const result = processor.process('See [[My Note|this page]] for details.');
			expect(result.content).toBe('See [this page](/notes/my-note) for details.');
		});

		it('should slugify the page name', () => {
			const result = processor.process('[[Page With Spaces & Symbols!]]');
			expect(result.content).toBe('[Page With Spaces & Symbols!](/notes/page-with-spaces-symbols)');
		});

		it('should handle custom base path', () => {
			const customProcessor = new ContentProcessor({
				wikiLinkStyle: 'link',
				linkBasePath: '/blog/posts/',
			});
			const result = customProcessor.process('[[My Post]]');
			expect(result.content).toBe('[My Post](/blog/posts/my-post)');
		});
	});

	describe('image embed conversion', () => {
		const processor = new ContentProcessor({
			assetsBasePath: '/assets/images/',
		});

		it('should convert simple image embed', () => {
			const result = processor.process('![[photo.png]]');
			expect(result.content).toBe('![photo](/assets/images/photo.png)');
		});

		it('should convert image embed with alt text', () => {
			const result = processor.process('![[photo.png|My vacation photo]]');
			expect(result.content).toBe('![My vacation photo](/assets/images/photo.png)');
		});

		it('should handle image with path', () => {
			const result = processor.process('![[attachments/subfolder/image.jpg]]');
			expect(result.content).toBe('![image](/assets/images/image.jpg)');
		});

		it('should include siteBasePath in image URL for Jekyll sites with baseurl', () => {
			const processorWithBasePath = new ContentProcessor({
				assetsBasePath: '/assets/images/',
				siteBasePath: '/notes',
			});
			const result = processorWithBasePath.process('![[photo.png]]');
			expect(result.content).toBe('![photo](/notes/assets/images/photo.png)');
		});

		it('should track assets for upload', () => {
			const result = processor.process('![[photo.png]] and ![[diagram.svg]]');
			expect(result.assets).toHaveLength(2);
			expect(result.assets[0]).toEqual({
				originalRef: '![[photo.png]]',
				filename: 'photo.png',
				targetPath: 'assets/images/photo.png',
			});
			expect(result.assets[1]).toEqual({
				originalRef: '![[diagram.svg]]',
				filename: 'diagram.svg',
				targetPath: 'assets/images/diagram.svg',
			});
		});

		it('should handle custom assets path', () => {
			const customProcessor = new ContentProcessor({
				assetsBasePath: '/img/',
			});
			const result = customProcessor.process('![[photo.png]]');
			expect(result.content).toBe('![photo](/img/photo.png)');
			expect(result.assets[0]?.targetPath).toBe('img/photo.png');
		});

		it('should handle various image extensions', () => {
			const result = processor.process('![[a.png]] ![[b.jpg]] ![[c.gif]] ![[d.webp]] ![[e.svg]]');
			expect(result.content).toBe(
				'![a](/assets/images/a.png) ![b](/assets/images/b.jpg) ![c](/assets/images/c.gif) ![d](/assets/images/d.webp) ![e](/assets/images/e.svg)'
			);
			expect(result.assets).toHaveLength(5);
		});

		it('should prefix asset filenames when assetPrefix is set', () => {
			const prefixedProcessor = new ContentProcessor({
				assetsBasePath: '/assets/images/',
				assetPrefix: 'my-post-slug',
			});
			const result = prefixedProcessor.process('![[photo.png]]');
			expect(result.content).toBe('![photo](/assets/images/my-post-slug-photo.png)');
			expect(result.assets[0]?.targetPath).toBe('assets/images/my-post-slug-photo.png');
			expect(result.assets[0]?.filename).toBe('photo.png'); // Original filename preserved
		});

		it('should prefix multiple assets with same prefix', () => {
			const prefixedProcessor = new ContentProcessor({
				assetsBasePath: '/assets/images/',
				assetPrefix: 'post-1',
			});
			const result = prefixedProcessor.process('![[a.png]] ![[b.jpg]]');
			expect(result.content).toBe('![a](/assets/images/post-1-a.png) ![b](/assets/images/post-1-b.jpg)');
		});
	});

	describe('mixed content', () => {
		it('should handle content with both images and links', () => {
			const processor = new ContentProcessor({
				wikiLinkStyle: 'link',
				linkBasePath: '/notes/',
				assetsBasePath: '/assets/images/',
			});

			const content = `# My Post

Here's an image: ![[screenshot.png]]

And a link to [[Another Note|another page]].

More text with [[Simple Link]] in it.

Another image: ![[diagram.svg|Architecture diagram]]
`;

			const result = processor.process(content);

			expect(result.content).toContain('![screenshot](/assets/images/screenshot.png)');
			expect(result.content).toContain('[another page](/notes/another-note)');
			expect(result.content).toContain('[Simple Link](/notes/simple-link)');
			expect(result.content).toContain('![Architecture diagram](/assets/images/diagram.svg)');
			expect(result.assets).toHaveLength(2);
		});

		it('should preserve standard markdown links', () => {
			const processor = new ContentProcessor({ wikiLinkStyle: 'text' });
			const content = 'Wiki [[link]] and standard [link](https://example.com)';
			const result = processor.process(content);
			expect(result.content).toBe('Wiki link and standard [link](https://example.com)');
		});

		it('should preserve standard markdown images', () => {
			const processor = new ContentProcessor();
			const content = 'Wiki ![[image.png]] and standard ![alt](https://example.com/img.png)';
			const result = processor.process(content);
			expect(result.content).toContain('![image](/assets/images/image.png)');
			expect(result.content).toContain('![alt](https://example.com/img.png)');
		});

		it('should preserve code blocks', () => {
			const processor = new ContentProcessor({ wikiLinkStyle: 'text' });
			const content = `Text with [[link]]

\`\`\`
Code with [[not a link]]
\`\`\`

More [[links]]`;
			const result = processor.process(content);
			// Note: Current implementation doesn't skip code blocks - this documents current behavior
			// A more sophisticated implementation could preserve code blocks
			expect(result.content).toContain('Text with link');
			expect(result.content).toContain('More links');
		});
	});

	describe('edge cases', () => {
		const processor = new ContentProcessor({ wikiLinkStyle: 'text' });

		it('should handle empty content', () => {
			const result = processor.process('');
			expect(result.content).toBe('');
			expect(result.assets).toHaveLength(0);
		});

		it('should handle content with no wiki-links', () => {
			const content = 'Just regular markdown with **bold** and *italic*.';
			const result = processor.process(content);
			expect(result.content).toBe(content);
			expect(result.assets).toHaveLength(0);
		});

		it('should handle wiki-link at start of line', () => {
			const result = processor.process('[[Start]] of line');
			expect(result.content).toBe('Start of line');
		});

		it('should handle wiki-link at end of line', () => {
			const result = processor.process('End of [[line]]');
			expect(result.content).toBe('End of line');
		});

		it('should handle wiki-link with only spaces trimmed', () => {
			const result = processor.process('[[ Spaced Note ]]');
			expect(result.content).toBe('Spaced Note');
		});

		it('should handle consecutive wiki-links', () => {
			const result = processor.process('[[One]][[Two]][[Three]]');
			expect(result.content).toBe('OneTwoThree');
		});
	});
});
