import { describe, expect, it } from "vitest";

import { LiveMiniProgramCodeService } from "./mini-program-code-service";

describe("LiveMiniProgramCodeService", () => {
  it("fetches an access token once and caches the product code", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (
      input: string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      requests.push({ url, ...(init ? { init } : {}) });
      if (url.includes("/cgi-bin/token")) {
        return Response.json({
          access_token: "wechat-token",
          expires_in: 7200,
        });
      }
      return new Response(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        { headers: { "content-type": "image/png" } },
      );
    };
    const service = new LiveMiniProgramCodeService(
      "test-app-id",
      "test-app-secret",
      "trial",
      fetchImpl,
    );

    const first = await service.getProductCode();
    const second = await service.getProductCode();

    expect(first).toEqual(second);
    expect(first.contentType).toBe("image/png");
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toContain("appid=test-app-id");
    expect(requests[0]!.url).toContain("secret=test-app-secret");
    expect(requests[1]!.url).toContain("access_token=wechat-token");
    expect(JSON.parse(String(requests[1]!.init?.body))).toMatchObject({
      scene: "source=procurement",
      page: "pages/ordering/index",
      env_version: "trial",
      check_path: true,
    });
  });

  it("turns WeChat JSON failures into a safe service error", async () => {
    const fetchImpl = async (input: string | URL): Promise<Response> => {
      if (String(input).includes("/cgi-bin/token")) {
        return Response.json({
          access_token: "wechat-token",
          expires_in: 7200,
        });
      }
      return Response.json({ errcode: 41030, errmsg: "invalid page" });
    };
    const service = new LiveMiniProgramCodeService(
      "test-app-id",
      "test-app-secret",
      "release",
      fetchImpl,
    );

    await expect(service.getProductCode()).rejects.toMatchObject({
      statusCode: 503,
      code: "MINI_PROGRAM_CODE_UNAVAILABLE",
      details: { wechatErrorCode: 41030 },
    });
  });
});
