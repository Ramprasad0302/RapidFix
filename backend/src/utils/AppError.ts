/** Operational error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'Invalid request', code = 'BAD_REQUEST', details?: unknown) {
    return new AppError(400, code, message, details);
  }
  static unauthorized(message = 'Please log in to continue', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }
  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }
  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }
  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(409, code, message);
  }
  static tooMany(message = 'Too many requests. Please try again shortly.', code = 'RATE_LIMITED') {
    return new AppError(429, code, message);
  }
}
