export const errorCodes = [
  "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT",
  "RATE_LIMITED", "UNAVAILABLE", "INTERNAL_ERROR"
] as const;

export type ErrorCode = (typeof errorCodes)[number];

/** Safe application error suitable for an API envelope; never expose raw provider errors. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ApiSuccess<T> = { data: T; error: null };
export type ApiFailure = { data: null; error: { code: ErrorCode; message: string; details?: Record<string, string> } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function toApiResponse<T>(operation: () => T): ApiResponse<T> {
  try { return { data: operation(), error: null }; }
  catch (error) {
    if (error instanceof AppError) return { data: null, error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } };
    return { data: null, error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } };
  }
}
