import type {
  RecipeCategory,
  RecipeImportDraft,
  RecipeImportPlatform,
} from "@jiayan/contracts";

const maximumHtmlBytes = 2 * 1024 * 1024;
const allowedHosts = {
  xiaohongshu: new Set([
    "xiaohongshu.com",
    "www.xiaohongshu.com",
    "xhslink.com",
    "www.xhslink.com",
  ]),
  xiachufang: new Set(["xiachufang.com", "www.xiachufang.com"]),
} satisfies Record<RecipeImportPlatform, Set<string>>;

export interface ExtractedRecipeImport {
  sourceUrl: string;
  draft: RecipeImportDraft;
  warnings: string[];
}

export interface RecipeImportSourceClient {
  extract(
    sourceUrl: string,
    platform: RecipeImportPlatform,
  ): Promise<ExtractedRecipeImport>;
}

export function detectRecipeImportPlatform(
  sourceUrl: string,
): RecipeImportPlatform | null {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (allowedHosts.xiaohongshu.has(host)) return "xiaohongshu";
  if (allowedHosts.xiachufang.has(host)) return "xiachufang";
  return null;
}

export class MockRecipeImportSourceClient implements RecipeImportSourceClient {
  async extract(
    sourceUrl: string,
    platform: RecipeImportPlatform,
  ): Promise<ExtractedRecipeImport> {
    const platformName = platform === "xiaohongshu" ? "小红书" : "下厨房";
    return {
      sourceUrl,
      draft: {
        name: `待核对的${platformName}菜谱`,
        description: `由${platformName}链接创建的开发环境草稿，请根据原页面补全内容。`,
        category: "other",
        coverEmoji: "🍲",
        cookMinutes: null,
        tips: null,
        ingredients: [],
        steps: [],
      },
      warnings: ["当前为本地开发模式，未访问外部页面，请手动补全食材和步骤。"],
    };
  }
}

export class LiveRecipeImportSourceClient implements RecipeImportSourceClient {
  async extract(
    sourceUrl: string,
    platform: RecipeImportPlatform,
  ): Promise<ExtractedRecipeImport> {
    const { response, finalUrl } = await fetchAllowedPage(sourceUrl, platform);
    const html = await readLimitedHtml(response);
    const structuredRecipe = findStructuredRecipe(html);
    const title = cleanTitle(
      textValue(structuredRecipe?.name) ||
        findMetaContent(html, "og:title") ||
        findDocumentTitle(html) ||
        `待核对的${platform === "xiaohongshu" ? "小红书" : "下厨房"}菜谱`,
    );
    const description = cleanText(
      textValue(structuredRecipe?.description) ||
        findMetaContent(html, "og:description") ||
        findMetaContent(html, "description") ||
        "",
    );
    const ingredients = stringArray(structuredRecipe?.recipeIngredient)
      .map((name) => cleanText(name))
      .filter(Boolean)
      .slice(0, 100)
      .map((name) => ({
        name: name.slice(0, 120),
        quantity: null,
        unit: null,
        category: "other",
      }));
    const steps = flattenInstructions(structuredRecipe?.recipeInstructions)
      .map((instruction) => cleanText(instruction))
      .filter(Boolean)
      .slice(0, 100)
      .map((instruction) => ({ instruction: instruction.slice(0, 2_000) }));
    const category = inferCategory(`${title} ${description}`);
    const warnings = ["第三方图片不会自动复制，请在保存后上传自己的成品图。"];
    if (ingredients.length === 0 || steps.length === 0) {
      warnings.push("原页面没有提供可稳定解析的完整用料或步骤，请核对并补全。");
    }
    if (platform === "xiaohongshu") {
      warnings.push("小红书页面结构可能变化，导入结果仅作为待核对草稿。");
    }

    return {
      sourceUrl: finalUrl,
      draft: {
        name: title.slice(0, 120),
        description: description ? description.slice(0, 2_000) : null,
        category,
        coverEmoji: coverForCategory(category),
        cookMinutes: parseDuration(textValue(structuredRecipe?.totalTime)),
        tips: null,
        ingredients,
        steps,
      },
      warnings,
    };
  }
}

async function fetchAllowedPage(
  sourceUrl: string,
  platform: RecipeImportPlatform,
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = sourceUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    assertAllowedUrl(currentUrl, platform);
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "JiayanRecipeImporter/1.0 (+private user initiated import)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("外部页面返回了无效跳转");
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) throw new Error(`外部页面返回 ${response.status}`);
    const finalUrl = response.url || currentUrl;
    assertAllowedUrl(finalUrl, platform);
    return { response, finalUrl };
  }
  throw new Error("外部链接跳转次数过多");
}

function assertAllowedUrl(url: string, platform: RecipeImportPlatform): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !allowedHosts[platform].has(parsed.hostname.toLowerCase())
  ) {
    throw new Error("链接跳转到了不受支持的网站");
  }
}

async function readLimitedHtml(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) throw new Error("链接不是网页内容");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maximumHtmlBytes) throw new Error("外部页面内容过大");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let html = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    byteCount += chunk.value.byteLength;
    if (byteCount > maximumHtmlBytes) {
      await reader.cancel();
      throw new Error("外部页面内容过大");
    }
    html += decoder.decode(chunk.value, { stream: true });
  }
  return html + decoder.decode();
}

function findStructuredRecipe(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scripts) {
    try {
      const candidate = findRecipeNode(JSON.parse(match[1] ?? "null"));
      if (candidate) return candidate;
    } catch {
      // 部分站点会在 JSON-LD 中混入非标准字符，继续使用 meta 信息。
    }
  }
  return null;
}

function findRecipeNode(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
    return record;
  }
  return findRecipeNode(record["@graph"]);
}

function findMetaContent(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const property =
      attributeValue(tag, "property") || attributeValue(tag, "name");
    if (property.toLowerCase() === key.toLowerCase()) {
      return decodeHtml(attributeValue(tag, "content"));
    }
  }
  return "";
}

function findDocumentTitle(html: string): string {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
}

function attributeValue(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? "";
}

function flattenInstructions(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return [record.text];
  return flattenInstructions(record.itemListElement);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanTitle(value: string): string {
  return cleanText(value)
    .replace(/\s*[-_|].*?(小红书|下厨房).*$/i, "")
    .trim();
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseDuration(value: string): number | null {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) return null;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return minutes >= 1 && minutes <= 1_440 ? minutes : null;
}

function inferCategory(value: string): RecipeCategory {
  if (/汤|羹|粥/.test(value)) return "soup";
  if (/鱼|虾|蟹|海鲜/.test(value)) return "fish";
  if (/蛋|奶/.test(value)) return "egg";
  if (/鸡|鸭|肉|排骨|牛|羊/.test(value)) return "meat";
  if (/饭|面|粉|饼|馒头/.test(value)) return "staple";
  if (/菜|瓜|豆腐|菌|菇/.test(value)) return "vegetable";
  return "other";
}

function coverForCategory(category: RecipeCategory): string {
  return {
    vegetable: "🥬",
    meat: "🥘",
    fish: "🐟",
    soup: "🥣",
    egg: "🍳",
    staple: "🍚",
    other: "🍲",
  }[category];
}
