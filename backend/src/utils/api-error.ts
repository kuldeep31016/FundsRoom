/**
 * Machine-readable error codes returned to clients as `error.code`.
 * The frontend switches on these rather than on message text.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_SKU: 'DUPLICATE_SKU',
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  MALFORMED_JSON: 'MALFORMED_JSON',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * The only error type route/service code should throw deliberately.
 * Anything else that escapes is treated as an unexpected 500 by the error
 * middleware and its details are hidden in production.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: FieldIssue[];
  /** Extra machine-readable context (e.g. which product was short on stock). */
  readonly meta?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: FieldIssue[]; meta?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.meta = options.meta;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: FieldIssue[]): ApiError {
    return new ApiError(400, ERROR_CODES.VALIDATION_ERROR, message, { details });
  }

  static unauthenticated(
    message = 'Authentication required.',
    code: ErrorCode = ERROR_CODES.UNAUTHENTICATED,
  ): ApiError {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action.'): ApiError {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(resource = 'Resource'): ApiError {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, `${resource} not found.`);
  }

  static conflict(
    message: string,
    code: ErrorCode = ERROR_CODES.CONFLICT,
    meta?: Record<string, unknown>,
  ): ApiError {
    return new ApiError(409, code, message, { meta });
  }

  static internal(message = 'An unexpected error occurred.'): ApiError {
    return new ApiError(500, ERROR_CODES.INTERNAL_ERROR, message);
  }
}
