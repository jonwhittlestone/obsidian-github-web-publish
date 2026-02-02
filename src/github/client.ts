/**
 * GitHub API Client
 *
 * Uses Obsidian's requestUrl() to bypass CORS on mobile.
 * All GitHub operations are done via REST API - no local git required.
 */

import { requestUrl } from 'obsidian';

const GITHUB_API_BASE = 'https://api.github.com';

/** Default retry configuration */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 10000;

/**
 * HTTP status codes that are safe to retry
 */
function isRetryableStatusCode(status: number): boolean {
	// Retry on rate limits and server errors
	return status === 429 || (status >= 500 && status < 600);
}

/**
 * Check if an error is retryable (network issues, rate limits, server errors)
 */
function isRetryableError(error: unknown): boolean {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();

		// Check for retryable status codes in API errors (429, 5xx)
		const statusMatch = error.message.match(/GitHub API error \((\d+)\)/);
		if (statusMatch && statusMatch[1]) {
			const status = parseInt(statusMatch[1], 10);
			return isRetryableStatusCode(status);
		}

		// Only retry network errors that indicate transient failures
		// These are the kinds of errors requestUrl throws for actual network issues
		const networkErrorPatterns = [
			'timeout',
			'timed out',
			'econnreset',
			'econnrefused',
			'enetunreach',
			'enotfound',
			'socket hang up',
			'network error',
			'fetch failed',
			'failed to fetch',
		];
		if (networkErrorPatterns.some(pattern => message.includes(pattern))) {
			return true;
		}
	}
	return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
	// Exponential backoff: baseDelay * 2^attempt
	const exponentialDelay = baseDelay * Math.pow(2, attempt);
	// Add jitter (±25%) to prevent thundering herd
	const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
	const delay = Math.min(exponentialDelay + jitter, maxDelay);
	return Math.round(delay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export interface GitHubClientConfig {
	token: string;
	owner: string;
	repo: string;
}

export interface CreateBranchResult {
	ref: string;
	sha: string;
}

export interface CreateFileResult {
	sha: string;
	path: string;
}

export interface CreatePRResult {
	number: number;
	html_url: string;
	title: string;
}

/**
 * GitHub API client using Obsidian's requestUrl for CORS bypass
 */
export class GitHubClient {
	private token: string;
	private owner: string;
	private repo: string;

	constructor(config: GitHubClientConfig) {
		this.token = config.token;
		this.owner = config.owner;
		this.repo = config.repo;
	}

	/**
	 * Make an authenticated request to the GitHub API (single attempt)
	 */
	private async requestOnce<T>(
		endpoint: string,
		options: {
			method?: string;
			body?: unknown;
		} = {}
	): Promise<T> {
		const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

		try {
			const response = await requestUrl({
				url,
				method: options.method || 'GET',
				headers: {
					'Authorization': `Bearer ${this.token}`,
					'Accept': 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28',
					'Content-Type': 'application/json',
				},
				body: options.body ? JSON.stringify(options.body) : undefined,
				throw: false, // Don't throw on non-2xx, let us handle it
			});

			if (response.status < 200 || response.status >= 300) {
				const error = response.json as {
					message?: string;
					errors?: Array<{ resource?: string; code?: string; field?: string; message?: string }>;
				};

				// Build detailed error message including any errors array
				let errorMessage = error?.message || 'Unknown error';
				if (error?.errors && error.errors.length > 0) {
					const details = error.errors
						.map(e => e.message || `${e.resource}.${e.field}: ${e.code}`)
						.join('; ');
					errorMessage += ` - ${details}`;
				}

				throw new Error(`GitHub API error (${response.status}): ${errorMessage}`);
			}

			return response.json as T;
		} catch (e) {
			// Re-throw our own errors
			if (e instanceof Error && e.message.startsWith('GitHub API error')) {
				throw e;
			}
			// Handle Obsidian's requestUrl errors (thrown for network issues, etc.)
			const message = e instanceof Error ? e.message : 'Unknown error';
			throw new Error(`GitHub API request failed: ${message}`);
		}
	}

	/**
	 * Make an authenticated request to the GitHub API with automatic retry
	 * Retries on network errors, rate limits (429), and server errors (5xx)
	 */
	private async request<T>(
		endpoint: string,
		options: {
			method?: string;
			body?: unknown;
		} = {}
	): Promise<T> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
			try {
				return await this.requestOnce<T>(endpoint, options);
			} catch (e) {
				lastError = e instanceof Error ? e : new Error(String(e));

				// Only retry on retryable errors
				if (!isRetryableError(lastError)) {
					throw lastError;
				}

				// Don't wait after the last attempt
				if (attempt < DEFAULT_MAX_RETRIES) {
					const delay = calculateBackoffDelay(
						attempt,
						DEFAULT_BASE_DELAY_MS,
						DEFAULT_MAX_DELAY_MS
					);
					console.debug(
						`[GitHubWebPublish] Retrying request (attempt ${attempt + 1}/${DEFAULT_MAX_RETRIES}) after ${delay}ms: ${endpoint}`
					);
					await sleep(delay);
				}
			}
		}

		// All retries exhausted
		throw lastError ?? new Error('Request failed after retries');
	}

	/**
	 * Get the SHA of the latest commit on a branch
	 */
	async getBranchSha(branch: string): Promise<string> {
		interface RefResponse {
			object: { sha: string };
		}

		const data = await this.request<RefResponse>(
			`/repos/${this.owner}/${this.repo}/git/refs/heads/${branch}`
		);
		return data.object.sha;
	}

	/**
	 * Check if a branch exists
	 */
	async branchExists(branchName: string): Promise<boolean> {
		try {
			await this.getBranchSha(branchName);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Create a new branch from a base branch
	 */
	async createBranch(branchName: string, baseBranch: string): Promise<CreateBranchResult> {
		const baseSha = await this.getBranchSha(baseBranch);

		interface CreateRefResponse {
			ref: string;
			object: { sha: string };
		}

		const data = await this.request<CreateRefResponse>(
			`/repos/${this.owner}/${this.repo}/git/refs`,
			{
				method: 'POST',
				body: {
					ref: `refs/heads/${branchName}`,
					sha: baseSha,
				},
			}
		);

		return {
			ref: data.ref,
			sha: data.object.sha,
		};
	}

	/**
	 * Create a fresh branch, deleting any existing branch with the same name first.
	 * Use this for publish/update operations to handle retry scenarios.
	 */
	async ensureFreshBranch(branchName: string, baseBranch: string): Promise<CreateBranchResult> {
		// Delete existing branch if it exists (cleanup from failed attempts)
		if (await this.branchExists(branchName)) {
			try {
				await this.deleteBranch(branchName);
			} catch {
				// Ignore deletion errors - branch might be protected or already gone
			}
		}

		return this.createBranch(branchName, baseBranch);
	}

	/**
	 * Create or update a file in the repository
	 *
	 * @param path Path in the repo
	 * @param content File content (text or base64-encoded binary)
	 * @param message Commit message
	 * @param branch Target branch
	 * @param isBase64 If true, content is already base64-encoded (for binary files)
	 * @param existingSha SHA of the existing file (required for updates)
	 */
	async createOrUpdateFile(
		path: string,
		content: string,
		message: string,
		branch: string,
		isBase64 = false,
		existingSha?: string
	): Promise<CreateFileResult> {
		let encodedContent: string;

		if (isBase64) {
			// Content is already base64-encoded (binary files like images)
			encodedContent = content;
		} else {
			// Base64 encode the text content (handles UTF-8 properly)
			const encoder = new TextEncoder();
			const bytes = encoder.encode(content);
			encodedContent = btoa(String.fromCharCode(...bytes));
		}

		interface FileResponse {
			content: { sha: string; path: string };
		}

		const body: { message: string; content: string; branch: string; sha?: string } = {
			message,
			content: encodedContent,
			branch,
		};

		// Include SHA for updates to existing files
		if (existingSha) {
			body.sha = existingSha;
		}

		const response = await this.request<FileResponse>(
			`/repos/${this.owner}/${this.repo}/contents/${path}`,
			{
				method: 'PUT',
				body,
			}
		);

		return {
			sha: response.content.sha,
			path: response.content.path,
		};
	}

	/**
	 * Create a pull request
	 */
	async createPullRequest(
		title: string,
		head: string,
		base: string,
		body?: string
	): Promise<CreatePRResult> {
		interface PRResponse {
			number: number;
			html_url: string;
			title: string;
		}

		const data = await this.request<PRResponse>(
			`/repos/${this.owner}/${this.repo}/pulls`,
			{
				method: 'POST',
				body: {
					title,
					head,
					base,
					body: body || '',
				},
			}
		);

		return {
			number: data.number,
			html_url: data.html_url,
			title: data.title,
		};
	}

	/**
	 * Add labels to an issue/PR
	 */
	async addLabels(issueNumber: number, labels: string[]): Promise<void> {
		await this.request(
			`/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels`,
			{
				method: 'POST',
				body: { labels },
			}
		);
	}

	/**
	 * Merge a pull request
	 */
	async mergePullRequest(prNumber: number, commitTitle?: string): Promise<void> {
		await this.request(
			`/repos/${this.owner}/${this.repo}/pulls/${prNumber}/merge`,
			{
				method: 'PUT',
				body: {
					merge_method: 'squash',
					commit_title: commitTitle,
				},
			}
		);
	}

	/**
	 * Close a pull request without merging
	 */
	async closePullRequest(prNumber: number): Promise<void> {
		await this.request(
			`/repos/${this.owner}/${this.repo}/pulls/${prNumber}`,
			{
				method: 'PATCH',
				body: { state: 'closed' },
			}
		);
	}

	/**
	 * Find an open PR by branch name
	 */
	async findOpenPR(branchName: string): Promise<{ number: number; html_url: string } | null> {
		interface PRItem {
			number: number;
			html_url: string;
			head: { ref: string };
			state: string;
		}

		try {
			const prs = await this.request<PRItem[]>(
				`/repos/${this.owner}/${this.repo}/pulls?head=${this.owner}:${branchName}&state=open`
			);
			if (prs.length > 0 && prs[0]) {
				return { number: prs[0].number, html_url: prs[0].html_url };
			}
			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Delete a branch
	 */
	async deleteBranch(branchName: string): Promise<void> {
		await this.request(
			`/repos/${this.owner}/${this.repo}/git/refs/heads/${branchName}`,
			{ method: 'DELETE' }
		);
	}

	/**
	 * List files in a directory
	 */
	async listFiles(path: string, branch?: string): Promise<Array<{ name: string; path: string; sha: string }>> {
		interface ContentItem {
			name: string;
			path: string;
			sha: string;
			type: string;
		}

		const ref = branch ? `?ref=${branch}` : '';
		const data = await this.request<ContentItem[]>(
			`/repos/${this.owner}/${this.repo}/contents/${path}${ref}`
		);

		return data
			.filter(item => item.type === 'file')
			.map(item => ({ name: item.name, path: item.path, sha: item.sha }));
	}

	/**
	 * Delete a file from the repository
	 */
	async deleteFile(path: string, message: string, branch: string, sha: string): Promise<void> {
		await this.request(
			`/repos/${this.owner}/${this.repo}/contents/${path}`,
			{
				method: 'DELETE',
				body: {
					message,
					sha,
					branch,
				},
			}
		);
	}

	/**
	 * Get file info (including SHA) from the repository
	 */
	async getFile(path: string, branch?: string): Promise<{ sha: string; content: string } | null> {
		interface FileResponse {
			sha: string;
			content: string;
		}

		try {
			const ref = branch ? `?ref=${branch}` : '';
			const data = await this.request<FileResponse>(
				`/repos/${this.owner}/${this.repo}/contents/${path}${ref}`
			);
			return { sha: data.sha, content: data.content };
		} catch {
			return null;
		}
	}
}
