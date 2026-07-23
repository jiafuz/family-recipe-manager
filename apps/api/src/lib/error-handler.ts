import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { AppError } from "./app-error";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        meta: { requestId: request.id },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "提交的数据不符合要求",
          details: { issues: error.issues },
        },
        meta: { requestId: request.id },
      });
    }

    request.log.error({ err: error }, "未处理的请求异常");
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "服务暂时不可用，请稍后重试",
      },
      meta: { requestId: request.id },
    });
  });
}
