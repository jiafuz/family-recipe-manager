import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectRecipeImportPlatform,
  LiveRecipeImportSourceClient,
} from "./import-source-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recipe import source client", () => {
  it("only recognizes supported HTTPS recipe hosts", () => {
    expect(
      detectRecipeImportPlatform("https://www.xiaohongshu.com/explore/123"),
    ).toBe("xiaohongshu");
    expect(
      detectRecipeImportPlatform("https://www.xiachufang.com/recipe/123/"),
    ).toBe("xiachufang");
    expect(
      detectRecipeImportPlatform("http://www.xiachufang.com/recipe/123/"),
    ).toBeNull();
    expect(detectRecipeImportPlatform("https://example.com/recipe")).toBeNull();
  });

  it("extracts a review draft from structured recipe data", async () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Recipe",
        name: "家常烧豆腐",
        description: "外焦里嫩的家常做法",
        totalTime: "PT25M",
        recipeIngredient: ["豆腐 1 块", "小葱 2 根"],
        recipeInstructions: [
          { "@type": "HowToStep", text: "豆腐切块并煎香。" },
          { "@type": "HowToStep", text: "加入调味汁焖五分钟。" },
        ],
      })}</script>
    </head></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(html, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      ),
    );

    const result = await new LiveRecipeImportSourceClient().extract(
      "https://www.xiachufang.com/recipe/123/",
      "xiachufang",
    );

    expect(result.draft).toMatchObject({
      name: "家常烧豆腐",
      category: "vegetable",
      cookMinutes: 25,
    });
    expect(result.draft.ingredients).toHaveLength(2);
    expect(result.draft.steps).toHaveLength(2);
  });

  it("rejects redirects leaving the supported host allowlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://example.com/private" },
          }),
      ),
    );

    await expect(
      new LiveRecipeImportSourceClient().extract(
        "https://www.xiachufang.com/recipe/123/",
        "xiachufang",
      ),
    ).rejects.toThrow("不受支持的网站");
  });
});
