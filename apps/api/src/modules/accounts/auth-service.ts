import { createHmac } from "node:crypto";

import type { CurrentUserResponse, SessionResponse } from "@jiayan/contracts";
import { ulid } from "ulid";

import { AppError } from "../../lib/app-error";
import type { AccountRepository, KitchenRepository } from "./repository";
import { TokenService, type AuthPrincipal } from "./token-service";
import type { WechatSessionClient } from "./wechat-session-client";

export interface AuthServiceOptions {
  accounts: AccountRepository;
  kitchens: KitchenRepository;
  wechat: WechatSessionClient;
  tokens: TokenService;
  identityHashSecret: string;
  refreshTokenTtlDays: number;
}

export class AuthService {
  private readonly accounts: AccountRepository;
  private readonly kitchens: KitchenRepository;
  private readonly wechat: WechatSessionClient;
  private readonly tokens: TokenService;
  private readonly identityHashSecret: string;
  private readonly refreshTokenTtlDays: number;

  constructor(options: AuthServiceOptions) {
    this.accounts = options.accounts;
    this.kitchens = options.kitchens;
    this.wechat = options.wechat;
    this.tokens = options.tokens;
    this.identityHashSecret = options.identityHashSecret;
    this.refreshTokenTtlDays = options.refreshTokenTtlDays;
  }

  async loginWithWechat(
    code: string,
    deviceLabel: string | null,
  ): Promise<SessionResponse> {
    const wechatSession = await this.wechat.exchangeCode(code);
    const user = await this.accounts.findOrCreateWechatUser({
      userId: ulid(),
      identityId: ulid(),
      identitySubject: this.hashIdentity(wechatSession.openId),
      unionSubject: wechatSession.unionId
        ? this.hashIdentity(wechatSession.unionId)
        : null,
      defaultDisplayName: "微信用户",
    });

    return this.createSessionResponse(user, deviceLabel);
  }

  async refreshSession(
    refreshToken: string,
    deviceLabel: string | null,
  ): Promise<SessionResponse> {
    const storedSession =
      await this.accounts.findActiveSessionByRefreshTokenHash(
        this.tokens.hashRefreshToken(refreshToken),
      );

    if (!storedSession) {
      throw new AppError({
        statusCode: 401,
        code: "SESSION_EXPIRED",
        message: "登录状态已失效，请重新登录",
      });
    }

    const nextRefreshToken = this.tokens.createRefreshToken();
    const nextSessionId = ulid();
    const expiresAt = this.createRefreshExpiry();

    await this.accounts.rotateSession({
      previousSessionId: storedSession.id,
      nextSessionId,
      userId: storedSession.user.id,
      refreshTokenHash: this.tokens.hashRefreshToken(nextRefreshToken),
      expiresAt,
      deviceLabel,
    });

    return this.buildSessionResponse(
      storedSession.user,
      nextSessionId,
      nextRefreshToken,
    );
  }

  async authenticate(
    authorizationHeader: string | undefined,
  ): Promise<AuthPrincipal> {
    const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);

    if (!match?.[1]) {
      throw new AppError({
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "请先登录",
      });
    }

    const principal = await this.tokens.verifyAccessToken(match[1]);
    const active = await this.accounts.isSessionActive(
      principal.sessionId,
      principal.userId,
    );

    if (!active) {
      throw new AppError({
        statusCode: 401,
        code: "SESSION_EXPIRED",
        message: "登录状态已失效，请重新登录",
      });
    }

    return principal;
  }

  async getCurrentUser(userId: string): Promise<CurrentUserResponse> {
    const user = await this.accounts.findUserById(userId);

    if (!user) {
      throw new AppError({
        statusCode: 401,
        code: "SESSION_EXPIRED",
        message: "用户不存在或已注销",
      });
    }

    const kitchens = await this.kitchens.listForUser(userId);

    return {
      user,
      kitchens,
      currentKitchen: kitchens[0] ?? null,
    };
  }

  async logout(principal: AuthPrincipal): Promise<void> {
    await this.accounts.revokeSession(principal.sessionId, principal.userId);
  }

  private hashIdentity(subject: string): Uint8Array {
    return createHmac("sha256", this.identityHashSecret)
      .update(subject)
      .digest();
  }

  private async createSessionResponse(
    user: SessionResponse["user"],
    deviceLabel: string | null,
  ): Promise<SessionResponse> {
    const refreshToken = this.tokens.createRefreshToken();
    const sessionId = ulid();

    await this.accounts.createSession({
      sessionId,
      userId: user.id,
      refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
      expiresAt: this.createRefreshExpiry(),
      deviceLabel,
    });

    return this.buildSessionResponse(user, sessionId, refreshToken);
  }

  private async buildSessionResponse(
    user: SessionResponse["user"],
    sessionId: string,
    refreshToken: string,
  ): Promise<SessionResponse> {
    const [accessToken, kitchens] = await Promise.all([
      this.tokens.createAccessToken({ userId: user.id, sessionId }),
      this.kitchens.listForUser(user.id),
    ]);

    return {
      accessToken,
      accessTokenExpiresIn: this.tokens.getAccessTokenTtlSeconds(),
      refreshToken,
      user,
      kitchens,
    };
  }

  private createRefreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTokenTtlDays * 86_400_000);
  }
}
