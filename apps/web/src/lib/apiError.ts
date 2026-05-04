// Client-side mirror of the server's standardised error taxonomy.
// See apps/mobile/lib/api/apiError.ts for the parallel implementation.
//
// Audit item #4 (external_audit_may_2.md).

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly hint?: string;
  readonly requestId?: string;

  constructor(opts: {
    code: string;
    message: string;
    statusCode: number;
    retryable: boolean;
    hint?: string;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.retryable = opts.retryable;
    this.hint = opts.hint;
    this.requestId = opts.requestId;
  }
}

interface ModernErrorBody {
  error: { code: string; message: string; retryable: boolean; hint?: string };
  requestId?: string;
}

interface LegacyErrorBody {
  error: string;
}

function isModernShape(body: unknown): body is ModernErrorBody {
  return (
    !!body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "object" &&
    (body as { error: { code?: unknown } }).error !== null &&
    typeof (body as { error: { code?: unknown } }).error.code === "string"
  );
}

function isLegacyShape(body: unknown): body is LegacyErrorBody {
  return (
    !!body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  );
}

export function parseApiError(body: unknown, statusCode: number): ApiError {
  if (isModernShape(body)) {
    return new ApiError({
      code: body.error.code,
      message: body.error.message,
      statusCode,
      retryable: body.error.retryable,
      hint: body.error.hint,
      requestId: body.requestId,
    });
  }
  if (isLegacyShape(body)) {
    return new ApiError({
      code: deriveLegacyCode(statusCode),
      message: body.error,
      statusCode,
      retryable: statusCode >= 500 || statusCode === 429,
    });
  }
  return new ApiError({
    code: deriveLegacyCode(statusCode),
    message: `Request failed (HTTP ${statusCode}).`,
    statusCode,
    retryable: statusCode >= 500 || statusCode === 429,
  });
}

function deriveLegacyCode(statusCode: number): string {
  if (statusCode === 400) return "BAD_REQUEST";
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 429) return "TOO_MANY_REQUESTS";
  if (statusCode >= 500) return "INTERNAL";
  return "BAD_REQUEST";
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
