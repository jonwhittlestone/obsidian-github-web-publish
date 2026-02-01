/**
 * Frontmatter Validator - Validates note frontmatter before publishing
 *
 * Ensures posts have required fields and valid values before
 * allowing publish to proceed.
 */

import type { TFile, Vault } from 'obsidian';

/** Validation error */
export interface ValidationError {
	field: string;
	message: string;
}

/** Validation warning (doesn't block publish) */
export interface ValidationWarning {
	field: string;
	message: string;
}

/** Result of validation */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
	frontmatter: Record<string, unknown> | null;
}

/** Field types for validation */
export type FieldType = 'string' | 'boolean' | 'array' | 'date' | 'number';

/** A validation rule for a field */
export interface ValidationRule {
	field: string;
	required: boolean;
	type?: FieldType;
	maxLength?: number;
	values?: string[];
	pattern?: RegExp;
}

/** Default validation rules */
const DEFAULT_RULES: ValidationRule[] = [
	{
		field: 'title',
		required: true,
		type: 'string',
		maxLength: 200,
	},
	{
		field: 'layout',
		required: false,
		type: 'string',
		values: ['post', 'page', 'default'],
	},
	{
		field: 'description',
		required: false,
		type: 'string',
		maxLength: 500,
	},
	{
		field: 'categories',
		required: false,
		type: 'array',
	},
	{
		field: 'tags',
		required: false,
		type: 'array',
	},
	{
		field: 'date',
		required: false,
		type: 'date',
	},
	{
		field: 'hide',
		required: false,
		type: 'boolean',
	},
	{
		field: 'toc',
		required: false,
		type: 'boolean',
	},
	{
		field: 'image',
		required: false,
		type: 'string',
	},
	{
		field: 'author',
		required: false,
		type: 'string',
	},
	{
		field: 'comments',
		required: false,
		type: 'boolean',
	},
];

/**
 * Frontmatter Validator
 */
export class FrontmatterValidator {
	private vault: Vault;
	private rules: ValidationRule[];

	constructor(vault: Vault, customRules?: ValidationRule[]) {
		this.vault = vault;
		this.rules = customRules || DEFAULT_RULES;
	}

	/**
	 * Validate a file's frontmatter
	 */
	async validate(file: TFile): Promise<ValidationResult> {
		const content = await this.vault.read(file);
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];

		// Parse frontmatter
		let frontmatter: Record<string, unknown> | null = null;
		try {
			frontmatter = this.parseFrontmatter(content);
		} catch (e) {
			return {
				valid: false,
				errors: [{
					field: '_yaml',
					message: `Invalid YAML frontmatter: ${e instanceof Error ? e.message : 'Parse error'}`,
				}],
				warnings: [],
				frontmatter: null,
			};
		}

		// Check if frontmatter exists
		if (!frontmatter) {
			return {
				valid: false,
				errors: [{
					field: '_frontmatter',
					message: 'No frontmatter found. Add --- at the start of your file.',
				}],
				warnings: [],
				frontmatter: null,
			};
		}

		// Validate each rule
		for (const rule of this.rules) {
			const value = frontmatter[rule.field];

			// Check required fields
			if (rule.required && (value === undefined || value === null || value === '')) {
				errors.push({
					field: rule.field,
					message: `Missing required field: ${rule.field}`,
				});
				continue;
			}

			// Skip optional fields that aren't present
			if (value === undefined || value === null) {
				continue;
			}

			// Type validation
			if (rule.type && !this.validateType(value, rule.type)) {
				errors.push({
					field: rule.field,
					message: `Invalid type for ${rule.field}: expected ${rule.type}`,
				});
				continue;
			}

			// Max length validation (for strings)
			if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
				errors.push({
					field: rule.field,
					message: `${rule.field} exceeds maximum length of ${rule.maxLength} characters`,
				});
			}

			// Allowed values validation
			if (rule.values && typeof value === 'string' && !rule.values.includes(value)) {
				warnings.push({
					field: rule.field,
					message: `${rule.field} has unexpected value "${value}". Expected one of: ${rule.values.join(', ')}`,
				});
			}

			// Pattern validation
			if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
				errors.push({
					field: rule.field,
					message: `${rule.field} does not match required pattern`,
				});
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			frontmatter,
		};
	}

	/**
	 * Parse frontmatter from content
	 */
	private parseFrontmatter(content: string): Record<string, unknown> | null {
		const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!match || !match[1]) {
			return null;
		}

		const yamlContent = match[1];
		return this.parseYaml(yamlContent);
	}

	/**
	 * Simple YAML parser for frontmatter
	 * Handles common cases: strings, numbers, booleans, arrays, dates
	 */
	private parseYaml(yaml: string): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		const lines = yaml.split('\n');

		let currentKey: string | null = null;
		let currentArray: unknown[] | null = null;

		for (const line of lines) {
			// Skip empty lines and comments
			if (!line.trim() || line.trim().startsWith('#')) {
				continue;
			}

			// Array item
			if (line.match(/^\s*-\s+/) && currentKey && currentArray) {
				const value = line.replace(/^\s*-\s+/, '').trim();
				currentArray.push(this.parseValue(value));
				continue;
			}

			// Key-value pair
			const kvMatch = line.match(/^(\w+):\s*(.*)/);
			if (kvMatch && kvMatch[1]) {
				// Save previous array if any
				if (currentKey && currentArray) {
					result[currentKey] = currentArray;
					currentArray = null;
				}

				const key = kvMatch[1];
				const value = (kvMatch[2] ?? '').trim();

				// Check if this starts an array
				if (value === '' || value === '[]') {
					currentKey = key;
					currentArray = [];
				} else if (value.startsWith('[') && value.endsWith(']')) {
					// Inline array: [item1, item2]
					const items = value.slice(1, -1).split(',').map(s => this.parseValue(s.trim()));
					result[key] = items;
					currentKey = null;
				} else {
					result[key] = this.parseValue(value);
					currentKey = null;
				}
			}
		}

		// Save final array if any
		if (currentKey && currentArray) {
			result[currentKey] = currentArray;
		}

		return result;
	}

	/**
	 * Parse a single YAML value
	 */
	private parseValue(value: string): unknown {
		// Remove quotes
		if ((value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))) {
			return value.slice(1, -1);
		}

		// Boolean
		if (value === 'true') return true;
		if (value === 'false') return false;

		// Number
		if (/^-?\d+$/.test(value)) {
			return parseInt(value, 10);
		}
		if (/^-?\d+\.\d+$/.test(value)) {
			return parseFloat(value);
		}

		// Date (YYYY-MM-DD)
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			return value; // Keep as string for dates
		}

		return value;
	}

	/**
	 * Validate a value's type
	 */
	private validateType(value: unknown, type: FieldType): boolean {
		switch (type) {
			case 'string':
				return typeof value === 'string';
			case 'boolean':
				return typeof value === 'boolean';
			case 'number':
				return typeof value === 'number';
			case 'array':
				return Array.isArray(value);
			case 'date':
				// Accept string in YYYY-MM-DD format or Date object
				if (typeof value === 'string') {
					return /^\d{4}-\d{2}-\d{2}/.test(value);
				}
				return value instanceof Date;
			default:
				return true;
		}
	}

	/**
	 * Format validation errors for display
	 */
	static formatErrors(result: ValidationResult): string {
		if (result.valid) {
			return '';
		}

		const lines: string[] = [];

		for (const error of result.errors) {
			lines.push(`• ${error.message}`);
		}

		return lines.join('\n');
	}
}
