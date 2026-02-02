/**
 * Tests for retry logic in GitHub client
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { RequestUrlResponse } from 'obsidian';

// Mock requestUrl at module level
vi.mock('obsidian', () => ({
	requestUrl: vi.fn(),
}));

import { requestUrl } from 'obsidian';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRequestUrl = requestUrl as Mock<any>;

/** Helper to create mock API responses */
function mockResponse(status: number, json: unknown): RequestUrlResponse {
	return {
		status,
		json,
		headers: {},
		text: JSON.stringify(json),
		arrayBuffer: new ArrayBuffer(0),
	};
}

// Import after mocking
import { GitHubClient } from '../src/github/client';

describe('Retry Logic', () => {
	let client: GitHubClient;

	beforeEach(() => {
		vi.clearAllMocks();
		client = new GitHubClient({
			token: 'test-token',
			owner: 'testowner',
			repo: 'testrepo',
		});
	});

	it('should retry on rate limit (429) errors', async () => {
		let callCount = 0;
		mockRequestUrl.mockImplementation(() => {
			callCount++;
			if (callCount <= 2) {
				return Promise.resolve(mockResponse(429, { message: 'Rate limit exceeded' }));
			}
			return Promise.resolve(mockResponse(200, { object: { sha: 'abc123' } }));
		});

		const result = await client.getBranchSha('main');

		expect(result).toBe('abc123');
		expect(callCount).toBe(3);
	}, 15000);

	it('should retry on server errors (5xx)', async () => {
		let callCount = 0;
		mockRequestUrl.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve(mockResponse(502, { message: 'Bad Gateway' }));
			}
			return Promise.resolve(mockResponse(200, { object: { sha: 'def456' } }));
		});

		const result = await client.getBranchSha('main');

		expect(result).toBe('def456');
		expect(callCount).toBe(2);
	}, 10000);

	it('should NOT retry on client errors (4xx except 429)', async () => {
		// 404 should not be retried
		mockRequestUrl.mockResolvedValueOnce(mockResponse(404, { message: 'Not Found' }));

		await expect(client.getBranchSha('nonexistent')).rejects.toThrow('GitHub API error (404)');
		expect(mockRequestUrl).toHaveBeenCalledTimes(1);
	});

	it('should NOT retry on validation errors (422)', async () => {
		mockRequestUrl.mockResolvedValueOnce(mockResponse(422, { message: 'Validation Failed' }));

		await expect(client.getBranchSha('main')).rejects.toThrow('GitHub API error (422)');
		expect(mockRequestUrl).toHaveBeenCalledTimes(1);
	});

	it('should NOT retry on auth errors (401)', async () => {
		mockRequestUrl.mockResolvedValueOnce(mockResponse(401, { message: 'Bad credentials' }));

		await expect(client.getBranchSha('main')).rejects.toThrow('GitHub API error (401)');
		expect(mockRequestUrl).toHaveBeenCalledTimes(1);
	});

	it('should give up after max retries', async () => {
		let callCount = 0;
		mockRequestUrl.mockImplementation(() => {
			callCount++;
			return Promise.resolve(mockResponse(503, { message: 'Service Unavailable' }));
		});

		await expect(client.getBranchSha('main')).rejects.toThrow('GitHub API error (503)');
		// Should retry 3 times + 1 initial = 4 total calls
		expect(callCount).toBe(4);
	}, 30000); // Long timeout due to exponential backoff delays

	it('should retry on network timeout errors', async () => {
		let callCount = 0;
		mockRequestUrl.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.reject(new Error('Request timeout'));
			}
			return Promise.resolve(mockResponse(200, { object: { sha: 'ghi789' } }));
		});

		const result = await client.getBranchSha('main');

		expect(result).toBe('ghi789');
		expect(callCount).toBe(2);
	}, 10000);

	it('should retry on connection refused errors', async () => {
		let callCount = 0;
		mockRequestUrl.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.reject(new Error('ECONNREFUSED'));
			}
			return Promise.resolve(mockResponse(200, { object: { sha: 'jkl012' } }));
		});

		const result = await client.getBranchSha('main');

		expect(result).toBe('jkl012');
		expect(callCount).toBe(2);
	}, 10000);
});
