/**
 * Tests for FrontmatterValidator
 */

import { describe, it, expect, vi } from 'vitest';
import { FrontmatterValidator } from '../src/publishing/validator';

// Mock vault that returns content we specify
function createMockVault(content: string) {
	return {
		read: vi.fn().mockResolvedValue(content),
	} as unknown as import('obsidian').Vault;
}

// Mock TFile
function createMockFile(name: string) {
	return {
		name,
		basename: name.replace(/\.md$/, ''),
		path: `test/${name}`,
		extension: 'md',
	} as unknown as import('obsidian').TFile;
}

describe('FrontmatterValidator', () => {
	describe('validate', () => {
		it('should pass validation with valid frontmatter', async () => {
			const content = `---
title: My Test Post
layout: post
description: A test post
tags:
  - test
  - example
---

# Content here
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.frontmatter).toEqual({
				title: 'My Test Post',
				layout: 'post',
				description: 'A test post',
				tags: ['test', 'example'],
			});
		});

		it('should fail when no frontmatter exists', async () => {
			const content = `# Just a heading

No frontmatter here.
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.field).toBe('_frontmatter');
			expect(result.errors[0]?.message).toContain('No frontmatter found');
		});

		it('should fail when title is missing', async () => {
			const content = `---
layout: post
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]?.field).toBe('title');
			expect(result.errors[0]?.message).toContain('Missing required field');
		});

		it('should fail when title is empty string', async () => {
			const content = `---
title: ""
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(false);
			expect(result.errors[0]?.field).toBe('title');
		});

		it('should warn on unexpected layout value', async () => {
			const content = `---
title: My Post
layout: custom
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]?.field).toBe('layout');
			expect(result.warnings[0]?.message).toContain('unexpected value');
		});

		it('should fail when title exceeds max length', async () => {
			const longTitle = 'A'.repeat(250);
			const content = `---
title: ${longTitle}
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(false);
			expect(result.errors[0]?.field).toBe('title');
			expect(result.errors[0]?.message).toContain('maximum length');
		});

		it('should parse inline arrays', async () => {
			const content = `---
title: My Post
tags: [one, two, three]
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
			expect(result.frontmatter?.tags).toEqual(['one', 'two', 'three']);
		});

		it('should parse booleans', async () => {
			const content = `---
title: My Post
hide: true
toc: false
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
			expect(result.frontmatter?.hide).toBe(true);
			expect(result.frontmatter?.toc).toBe(false);
		});

		it('should parse dates', async () => {
			const content = `---
title: My Post
date: 2026-01-15
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
			expect(result.frontmatter?.date).toBe('2026-01-15');
		});

		it('should parse numbers', async () => {
			const content = `---
title: My Post
order: 42
rating: 4.5
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
			expect(result.frontmatter?.order).toBe(42);
			expect(result.frontmatter?.rating).toBe(4.5);
		});

		it('should handle quoted strings', async () => {
			const content = `---
title: "Hello: World"
description: 'With single quotes'
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
			expect(result.frontmatter?.title).toBe('Hello: World');
			expect(result.frontmatter?.description).toBe('With single quotes');
		});

		it('should skip comments in YAML', async () => {
			const content = `---
# This is a comment
title: My Post
# Another comment
---

# Content
`;
			const vault = createMockVault(content);
			const validator = new FrontmatterValidator(vault);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
			expect(result.frontmatter?.title).toBe('My Post');
		});
	});

	describe('formatErrors', () => {
		it('should return empty string for valid result', () => {
			const result = {
				valid: true,
				errors: [],
				warnings: [],
				frontmatter: { title: 'Test' },
			};

			expect(FrontmatterValidator.formatErrors(result)).toBe('');
		});

		it('should format multiple errors', () => {
			const result = {
				valid: false,
				errors: [
					{ field: 'title', message: 'Missing required field: title' },
					{ field: 'description', message: 'Too long' },
				],
				warnings: [],
				frontmatter: null,
			};

			const formatted = FrontmatterValidator.formatErrors(result);
			expect(formatted).toContain('Missing required field: title');
			expect(formatted).toContain('Too long');
		});
	});

	describe('custom rules', () => {
		it('should use custom validation rules', async () => {
			const content = `---
title: My Post
author: John
---

# Content
`;
			const vault = createMockVault(content);
			const customRules = [
				{ field: 'title', required: true, type: 'string' as const },
				{ field: 'author', required: true, type: 'string' as const },
			];
			const validator = new FrontmatterValidator(vault, customRules);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(true);
		});

		it('should fail custom required field', async () => {
			const content = `---
title: My Post
---

# Content
`;
			const vault = createMockVault(content);
			const customRules = [
				{ field: 'title', required: true, type: 'string' as const },
				{ field: 'author', required: true, type: 'string' as const },
			];
			const validator = new FrontmatterValidator(vault, customRules);
			const file = createMockFile('test-post.md');

			const result = await validator.validate(file);

			expect(result.valid).toBe(false);
			expect(result.errors[0]?.field).toBe('author');
		});
	});
});
