import { ErrorCodes } from './error-codes.js';

export { ErrorCodes };

export class CloudError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

export function createError(code, message, details) {
  return new CloudError(code, message, details);
}

export function isAuthError(error) {
  const authCodes = [ErrorCodes.NO_SESSION, ErrorCodes.JWT_EXPIRED, ErrorCodes.AUTH_FAILED];
  return authCodes.includes(error?.code) ||
    error?.code === 'PGRST303' ||
    (error?.message && error.message.includes('JWT'));
}

export function isNetworkError(error) {
  return error?.code === ErrorCodes.NETWORK_ERROR ||
    error?.code === ErrorCodes.TIMEOUT ||
    error?.name === 'AbortError' ||
    (error?.message && error.message.includes('Load failed'));
}
