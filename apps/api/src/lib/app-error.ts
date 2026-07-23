import type { ErrorCode } from "@jiayan/contracts";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(options: {
    statusCode: number;
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "AppError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}
