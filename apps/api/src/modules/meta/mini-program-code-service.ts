import { z } from "zod";

import { AppError } from "../../lib/app-error";

export interface MiniProgramCodeImage {
  data: Buffer;
  contentType: "image/png" | "image/jpeg";
}

export interface MiniProgramCodeService {
  getProductCode(): Promise<MiniProgramCodeImage | null>;
}

type WechatEnvironment = "develop" | "trial" | "release";
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const accessTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const wechatErrorSchema = z.object({
  errcode: z.number(),
  errmsg: z.string().optional(),
});

export class LiveMiniProgramCodeService implements MiniProgramCodeService {
  private cachedCode: MiniProgramCodeImage | null = null;
  private pendingCode: Promise<MiniProgramCodeImage> | null = null;
  private accessToken: { value: string; expiresAt: number } | null = null;
  private pendingAccessToken: Promise<string> | null = null;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly environment: WechatEnvironment,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async getProductCode(): Promise<MiniProgramCodeImage> {
    if (this.cachedCode) return this.cachedCode;
    if (this.pendingCode) return this.pendingCode;

    this.pendingCode = this.fetchProductCode();
    try {
      this.cachedCode = await this.pendingCode;
      return this.cachedCode;
    } finally {
      this.pendingCode = null;
    }
  }

  private async fetchProductCode(): Promise<MiniProgramCodeImage> {
    const accessToken = await this.getAccessToken();
    const url = new URL("https://api.weixin.qq.com/wxa/getwxacodeunlimit");
    url.searchParams.set("access_token", accessToken);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scene: "source=procurement",
          page: "pages/ordering/index",
          check_path: true,
          env_version: this.environment,
          width: 280,
          auto_color: false,
          line_color: { r: 213, g: 72, b: 54 },
          is_hyaline: false,
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw miniProgramCodeError("暂时无法连接微信小程序码服务");
    }

    if (!response.ok) {
      throw miniProgramCodeError("微信小程序码服务暂时不可用");
    }

    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > 2 * 1024 * 1024) {
      throw miniProgramCodeError("微信小程序码返回的图片大小异常");
    }

    const contentType = detectImageType(data);
    if (contentType) return { data, contentType };

    const payload = parseWechatError(data);
    throw miniProgramCodeError("微信暂时无法生成小程序码", payload?.errcode);
  }

  private async getAccessToken(): Promise<string> {
    if (
      this.accessToken &&
      this.accessToken.expiresAt > Date.now() + 5 * 60 * 1_000
    ) {
      return this.accessToken.value;
    }
    if (this.pendingAccessToken) return this.pendingAccessToken;

    this.pendingAccessToken = this.fetchAccessToken();
    try {
      return await this.pendingAccessToken;
    } finally {
      this.pendingAccessToken = null;
    }
  }

  private async fetchAccessToken(): Promise<string> {
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", this.appId);
    url.searchParams.set("secret", this.appSecret);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw miniProgramCodeError("暂时无法获取微信接口凭证");
    }
    if (!response.ok) {
      throw miniProgramCodeError("微信接口凭证服务暂时不可用");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw miniProgramCodeError("微信接口凭证返回异常");
    }
    const success = accessTokenSchema.safeParse(payload);
    if (!success.success) {
      const failure = wechatErrorSchema.safeParse(payload);
      throw miniProgramCodeError(
        "微信接口凭证配置无效",
        failure.success ? failure.data.errcode : undefined,
      );
    }

    this.accessToken = {
      value: success.data.access_token,
      expiresAt: Date.now() + success.data.expires_in * 1_000,
    };
    return this.accessToken.value;
  }
}

export class MockMiniProgramCodeService implements MiniProgramCodeService {
  async getProductCode(): Promise<null> {
    return null;
  }
}

function detectImageType(
  data: Buffer,
): MiniProgramCodeImage["contentType"] | null {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) {
    return "image/jpeg";
  }
  return null;
}

function parseWechatError(
  data: Buffer,
): z.infer<typeof wechatErrorSchema> | null {
  try {
    const payload: unknown = JSON.parse(data.toString("utf8"));
    const parsed = wechatErrorSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function miniProgramCodeError(
  message: string,
  wechatErrorCode?: number,
): AppError {
  return new AppError({
    statusCode: 503,
    code: "MINI_PROGRAM_CODE_UNAVAILABLE",
    message,
    ...(wechatErrorCode === undefined ? {} : { details: { wechatErrorCode } }),
  });
}
