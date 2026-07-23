import { createHash } from "node:crypto";

import { z } from "zod";

import { AppError } from "../../lib/app-error";

export interface WechatSessionResult {
  openId: string;
  unionId: string | null;
}

export interface WechatSessionClient {
  exchangeCode(code: string): Promise<WechatSessionResult>;
}

const wechatSuccessSchema = z.object({
  openid: z.string().min(1),
  unionid: z.string().min(1).optional(),
});

const wechatErrorSchema = z.object({
  errcode: z.number(),
  errmsg: z.string().optional(),
});

export class LiveWechatSessionClient implements WechatSessionClient {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {}

  async exchangeCode(code: string): Promise<WechatSessionResult> {
    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", this.appId);
    url.searchParams.set("secret", this.appSecret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    let response: Response;

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new AppError({
        statusCode: 503,
        code: "WECHAT_LOGIN_FAILED",
        message: "暂时无法连接微信登录服务，请稍后重试",
      });
    }

    if (!response.ok) {
      throw new AppError({
        statusCode: 503,
        code: "WECHAT_LOGIN_FAILED",
        message: "微信登录服务暂时不可用",
      });
    }

    const payload: unknown = await response.json();
    const wechatError = wechatErrorSchema.safeParse(payload);

    if (wechatError.success) {
      throw new AppError({
        statusCode: 401,
        code: "WECHAT_LOGIN_FAILED",
        message: "微信登录凭证已失效，请重新登录",
        details: { wechatErrorCode: wechatError.data.errcode },
      });
    }

    const result = wechatSuccessSchema.safeParse(payload);

    if (!result.success) {
      throw new AppError({
        statusCode: 503,
        code: "WECHAT_LOGIN_FAILED",
        message: "微信登录返回数据异常",
      });
    }

    return {
      openId: result.data.openid,
      unionId: result.data.unionid ?? null,
    };
  }
}

export class MockWechatSessionClient implements WechatSessionClient {
  async exchangeCode(code: string): Promise<WechatSessionResult> {
    const subject = createHash("sha256")
      .update(code)
      .digest("hex")
      .slice(0, 28);

    return {
      openId: `mock_openid_${subject}`,
      unionId: null,
    };
  }
}
