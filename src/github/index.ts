/**
 * GitHub module - API client and authentication
 */

export { GitHubClient } from './client';
export type { GitHubClientConfig, CreateBranchResult, CreateFileResult, CreatePRResult } from './client';

export { performDeviceFlow, requestDeviceCode, waitForAuthorization, getUsername, OAuthError } from './auth';
export type { DeviceCodeResponse, VerificationCallback } from './auth';
