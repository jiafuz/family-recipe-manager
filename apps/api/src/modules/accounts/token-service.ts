import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { AppError } from "../../lib/app-error";

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
}

export class TokenService {
  private readonly secret: Uint8Array;

  constructor(
    secret: string,
    private readonly accessTokenTtlSeconds: number,
  ) {
    this.secret = new TextEncoder().encode(secret);
  }

  async createAccessToken(principal: AuthPrincipal): Promise<string> {
    return new SignJWT({ sid: principal.sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(principal.userId)
      .setIssuer("jiayan-api")
      .setAudience("jiayan-miniprogram")
      .setIssuedAt()
      .setExpirationTime(`${this.accessTokenTtlSeconds}s`)
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AuthPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ["HS256"],
        issuer: "jiayan-api",
        audience: "jiayan-miniprogram",
      });

      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
        throw new Error("令牌缺少必要字段");
      }

      return {
        userId: payload.sub,
        sessionId: payload.sid,
      };
    } catch {
      throw new AppError({
        statusCode: 401,
        code: "SESSION_EXPIRED",
        message: "登录状态已失效，请重新登录",
      });
    }
  }

  createRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashRefreshToken(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("hex");
  }

  getAccessTokenTtlSeconds(): number {
    return this.accessTokenTtlSeconds;
  }
}
