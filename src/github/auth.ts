/**
 * GitHub OAuth Device Flow Authentication
 *
 * Implements the Device Flow manually using Obsidian's requestUrl()
 * to bypass CORS restrictions on mobile.
 *
 * Flow:
 * 1. Request device code from GitHub
 * 2. Display user code and verification URL to user
 * 3. Poll for access token while user authorizes
 * 4. Return access token on success
 */

import { requestUrl } from 'obsidian';

/** Response from the device code request */
export interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
}

/** Response from the token polling request */
interface TokenResponse {
	access_token?: string;
	token_type?: string;
	scope?: string;
	error?: string;
	error_description?: string;
	interval?: number;
}

/** Callback for verification - called when user needs to enter code */
export type VerificationCallback = (verification: {
	userCode: string;
	verificationUri: string;
	expiresIn: number;
}) => void;

/** OAuth errors */
export class OAuthError extends Error {
	constructor(
		message: string,
		public readonly code?: string
	) {
		super(message);
		this.name = 'OAuthError';
	}
}

/**
 * Start the OAuth Device Flow
 *
 * @param clientId The GitHub OAuth App client ID
 * @returns Device code response with user code to display
 */
export async function requestDeviceCode(clientId: string): Promise<DeviceCodeResponse> {
	const response = await requestUrl({
		url: 'https://github.com/login/device/code',
		method: 'POST',
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			client_id: clientId,
			scope: 'repo',
		}),
	});

	if (response.status !== 200) {
		const error = response.json as { error?: string; error_description?: string };
		throw new OAuthError(
			error.error_description || error.error || 'Failed to start device flow',
			error.error
		);
	}

	return response.json as DeviceCodeResponse;
}

/**
 * Poll for the access token
 *
 * @param clientId The GitHub OAuth App client ID
 * @param deviceCode The device code from the initial request
 * @returns The access token if authorized, or throws an error
 */
async function pollForToken(clientId: string, deviceCode: string): Promise<TokenResponse> {
	const response = await requestUrl({
		url: 'https://github.com/login/oauth/access_token',
		method: 'POST',
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			client_id: clientId,
			device_code: deviceCode,
			grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
		}),
	});

	return response.json as TokenResponse;
}

/**
 * Wait for the specified interval
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Complete the OAuth Device Flow by polling for authorization
 *
 * @param clientId The GitHub OAuth App client ID
 * @param deviceCode The device code from the initial request
 * @param interval Polling interval in seconds
 * @param expiresIn Expiration time in seconds
 * @param onCancel Optional callback that returns true if flow should be cancelled
 * @returns The access token
 */
export async function waitForAuthorization(
	clientId: string,
	deviceCode: string,
	interval: number,
	expiresIn: number,
	onCancel?: () => boolean
): Promise<string> {
	const startTime = Date.now();
	const expiresAt = startTime + (expiresIn * 1000);
	let currentInterval = interval * 1000; // Convert to milliseconds

	while (Date.now() < expiresAt) {
		// Check if cancelled
		if (onCancel?.()) {
			throw new OAuthError('Authorization cancelled', 'cancelled');
		}

		// Wait before polling
		await sleep(currentInterval);

		// Poll for token
		const response = await pollForToken(clientId, deviceCode);

		if (response.access_token) {
			return response.access_token;
		}

		// Handle different error states
		switch (response.error) {
			case 'authorization_pending':
				// User hasn't authorized yet, keep polling
				continue;

			case 'slow_down':
				// We're polling too fast, increase interval
				currentInterval = (response.interval || interval + 5) * 1000;
				continue;

			case 'expired_token':
				throw new OAuthError('The device code has expired. Please try again.', response.error);

			case 'access_denied':
				throw new OAuthError('Authorization was denied by the user.', response.error);

			default:
				if (response.error) {
					throw new OAuthError(
						response.error_description || response.error,
						response.error
					);
				}
		}
	}

	throw new OAuthError('Authorization timed out. Please try again.', 'timeout');
}

/**
 * Get the username for an access token
 */
export async function getUsername(token: string): Promise<string> {
	const response = await requestUrl({
		url: 'https://api.github.com/user',
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Accept': 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		},
	});

	if (response.status !== 200) {
		throw new OAuthError('Failed to get user information');
	}

	const data = response.json as { login: string };
	return data.login;
}

/**
 * Perform the complete OAuth Device Flow
 *
 * @param clientId The GitHub OAuth App client ID
 * @param onVerification Callback when user needs to enter code
 * @param onCancel Optional callback that returns true if flow should be cancelled
 * @returns Object with access token and username
 */
export async function performDeviceFlow(
	clientId: string,
	onVerification: VerificationCallback,
	onCancel?: () => boolean
): Promise<{ token: string; username: string }> {
	// Step 1: Request device code
	const deviceCodeResponse = await requestDeviceCode(clientId);

	// Step 2: Notify caller to display code to user
	onVerification({
		userCode: deviceCodeResponse.user_code,
		verificationUri: deviceCodeResponse.verification_uri,
		expiresIn: deviceCodeResponse.expires_in,
	});

	// Step 3: Poll for authorization
	const token = await waitForAuthorization(
		clientId,
		deviceCodeResponse.device_code,
		deviceCodeResponse.interval,
		deviceCodeResponse.expires_in,
		onCancel
	);

	// Step 4: Get username
	const username = await getUsername(token);

	return { token, username };
}
