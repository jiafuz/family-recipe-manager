import type {
  MealType,
  ProcurementItemResponse,
  ProcurementSharePreview,
} from "@jiayan/contracts";
import { Button, Canvas, Text, View } from "@tarojs/components";
import Taro, { useLoad, useRouter, useShareAppMessage } from "@tarojs/taro";
import { useState } from "react";

import {
  ApiClientError,
  createProcurementSharePreview,
  downloadProductMiniProgramCode,
} from "../../../services/api-client";

import "./index.scss";

const mealTypeOrder: MealType[] = ["breakfast", "lunch", "dinner"];
const POSTER_CANVAS_ID = "procurementPosterCanvas";
const POSTER_WIDTH = 375;
const POSTER_MAX_NEEDED_ITEMS = 18;
const POSTER_MAX_SKIPPED_ITEMS = 8;
const POSTER_MAX_MEAL_ITEMS = 6;

const categoryLabels: Record<string, { label: string; icon: string }> = {
  vegetable: { label: "蔬菜菌菇", icon: "🥬" },
  meat: { label: "肉禽", icon: "🥩" },
  fish: { label: "水产", icon: "🐟" },
  egg: { label: "蛋奶", icon: "🥚" },
  staple: { label: "主食", icon: "🍚" },
  seasoning: { label: "调味", icon: "🧂" },
  other: { label: "其它", icon: "🧺" },
};

export default function ProcurementSharePage(): JSX.Element {
  const router = useRouter();
  const kitchenId = router.params.kitchenId ?? "";
  const date = router.params.date ?? "";
  const mealTypes = parseMealTypes(router.params.mealTypes);
  const [preview, setPreview] = useState<ProcurementSharePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [savingPoster, setSavingPoster] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(900);

  const load = async (): Promise<void> => {
    if (!kitchenId || !date || mealTypes.length === 0) {
      setErrorMessage("分享范围不完整，请返回重新选择");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      setPreview(
        await createProcurementSharePreview(kitchenId, date, { mealTypes }),
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useLoad(() => {
    void load();
  });

  useShareAppMessage(() =>
    Promise.resolve({
      title: preview
        ? `${formatDate(preview.date)} ${rangeLabel(preview.mealTypes)}采购清单`
        : "家宴 · 采购清单",
      path: `/pages/procurement/share/index?kitchenId=${encodeURIComponent(kitchenId)}&date=${encodeURIComponent(date)}&mealTypes=${encodeURIComponent(mealTypes.join(","))}`,
    }),
  );

  const neededItems = preview?.items.filter((item) => item.needed) ?? [];
  const skippedItems = preview?.items.filter((item) => !item.needed) ?? [];

  const savePoster = async (): Promise<void> => {
    if (!preview || savingPoster) return;
    setSavingPoster(true);
    try {
      if (!(await ensurePhotoAlbumPermission())) return;
      const poster = createPosterContent(preview);
      const miniProgramCodePath = await downloadProductMiniProgramCode().catch(
        () => null,
      );
      setCanvasHeight(poster.height);
      await waitForCanvasUpdate();
      const context = Taro.createCanvasContext(POSTER_CANVAS_ID);
      drawProcurementPoster(context, preview, poster, miniProgramCodePath);
      await new Promise<void>((resolve) => context.draw(false, resolve));
      const image = await Taro.canvasToTempFilePath({
        canvasId: POSTER_CANVAS_ID,
        width: POSTER_WIDTH,
        height: poster.height,
        destWidth: POSTER_WIDTH * 2,
        destHeight: poster.height * 2,
        fileType: "png",
        quality: 1,
      });
      await Taro.saveImageToPhotosAlbum({ filePath: image.tempFilePath });
      await Taro.showToast({
        title: miniProgramCodePath
          ? "采购清单已保存"
          : "已保存，暂未带小程序码",
        icon: miniProgramCodePath ? "success" : "none",
      });
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setSavingPoster(false);
    }
  };

  return (
    <View className="procurement-share-page">
      <View className="procurement-share-header">
        <Button onClick={() => Taro.navigateBack()}>‹</Button>
        <Text>分享采购清单</Text>
        <View />
      </View>

      {loading ? (
        <View className="procurement-share-state">正在整理采购清单…</View>
      ) : null}
      {errorMessage ? (
        <View className="procurement-share-state">
          <Text>{errorMessage}</Text>
          <Button onClick={load}>重新加载</Button>
        </View>
      ) : null}

      {preview ? (
        <>
          <View className="procurement-share-poster">
            <View className="procurement-share-poster__heading">
              <View>
                <Text>{formatDate(preview.date)}</Text>
                <Text>{rangeLabel(preview.mealTypes)}采购清单</Text>
              </View>
              <Text>家宴</Text>
            </View>

            <View className="procurement-share-summary">
              <View>
                <Text>{neededItems.length}</Text>
                <Text>项需要购买</Text>
              </View>
              <View>
                <Text>{skippedItems.length}</Text>
                <Text>项无需购买</Text>
              </View>
            </View>

            {neededItems.length > 0 ? (
              <View className="procurement-share-section">
                <View className="procurement-share-section__title">
                  <Text>需要购买</Text>
                  <Text>已按品类合并</Text>
                </View>
                {groupItems(neededItems).map(([category, items]) => (
                  <View
                    className={`procurement-share-group procurement-share-group--${category}`}
                    key={category}
                  >
                    <Text>
                      {(categoryLabels[category] ?? categoryLabels.other!).icon}
                    </Text>
                    <View>
                      <Text>
                        {
                          (categoryLabels[category] ?? categoryLabels.other!)
                            .label
                        }
                      </Text>
                      <Text>
                        {items
                          .map(
                            (item) =>
                              `${item.displayName} ${formatAmount(item)}`,
                          )
                          .join(" · ")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="procurement-share-all-ready">
                家里都备好了，无需额外采购
              </View>
            )}

            {skippedItems.length > 0 ? (
              <View className="procurement-share-skipped">
                <Text>无需购买</Text>
                <Text>
                  {skippedItems.map((item) => item.displayName).join("、")}
                </Text>
              </View>
            ) : null}

            <View className="procurement-share-meals">
              <Text>分餐明细</Text>
              {preview.meals.map((meal) => (
                <View className="procurement-share-meal" key={meal.mealType}>
                  <Text>{mealLabel(meal.mealType)}</Text>
                  <Text>
                    {meal.items.length > 0
                      ? meal.items
                          .map(
                            (item) =>
                              `${item.displayName} ${formatAmount(item)}`,
                          )
                          .join("、")
                      : "本餐没有采购食材"}
                  </Text>
                </View>
              ))}
            </View>

            <Text className="procurement-share-poster__footnote">
              根据当前家庭菜单实时生成 · 修订 {preview.revision}
            </Text>
          </View>

          <View className="procurement-share-tip">
            保存图片后可发给未加入厨房的家人；小程序卡片适合同厨房成员查看实时清单。
          </View>
          <Canvas
            canvasId={POSTER_CANVAS_ID}
            className="procurement-share-canvas"
            style={{
              width: `${POSTER_WIDTH}px`,
              height: `${canvasHeight}px`,
            }}
          />
          <View className="procurement-share-footer">
            <Button
              className="is-secondary"
              disabled={savingPoster}
              loading={savingPoster}
              onClick={() => void savePoster()}
            >
              保存图片
            </Button>
            <Button openType="share">微信小程序卡片</Button>
          </View>
        </>
      ) : null}
    </View>
  );
}

function parseMealTypes(value: string | undefined): MealType[] {
  let decoded = value ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Taro may already provide a decoded query value.
  }
  const selected = new Set(decoded.split(","));
  return mealTypeOrder.filter((mealType) => selected.has(mealType));
}

function groupItems(
  items: ProcurementItemResponse[],
): Array<[string, ProcurementItemResponse[]]> {
  const groups = new Map<string, ProcurementItemResponse[]>();
  for (const item of items) {
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }
  return [...groups.entries()];
}

function formatAmount(item: ProcurementItemResponse): string {
  if (item.totalQuantity === null) return item.unit || "适量";
  return `${item.totalQuantity}${item.unit ?? ""}`;
}

function formatDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function mealLabel(mealType: MealType): string {
  return { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" }[mealType];
}

function rangeLabel(mealTypes: MealType[]): string {
  return mealTypes.length === 3 ? "全天" : mealTypes.map(mealLabel).join("＋");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "errMsg" in error) {
    return String(error.errMsg);
  }
  return "采购清单加载失败";
}

interface PosterMealContent {
  mealType: MealType;
  items: ProcurementItemResponse[];
  omittedCount: number;
}

interface PosterContent {
  neededItems: ProcurementItemResponse[];
  omittedNeededCount: number;
  skippedItems: ProcurementItemResponse[];
  omittedSkippedCount: number;
  meals: PosterMealContent[];
  height: number;
}

function createPosterContent(preview: ProcurementSharePreview): PosterContent {
  const allNeededItems = preview.items.filter((item) => item.needed);
  const allSkippedItems = preview.items.filter((item) => !item.needed);
  const neededItems = allNeededItems.slice(0, POSTER_MAX_NEEDED_ITEMS);
  const skippedItems = allSkippedItems.slice(0, POSTER_MAX_SKIPPED_ITEMS);
  const meals = preview.meals.map((meal) => ({
    mealType: meal.mealType,
    items: meal.items.slice(0, POSTER_MAX_MEAL_ITEMS),
    omittedCount: Math.max(0, meal.items.length - POSTER_MAX_MEAL_ITEMS),
  }));
  const omittedNeededCount = Math.max(
    0,
    allNeededItems.length - POSTER_MAX_NEEDED_ITEMS,
  );
  const omittedSkippedCount = Math.max(
    0,
    allSkippedItems.length - POSTER_MAX_SKIPPED_ITEMS,
  );
  const neededHeight =
    neededItems.length > 0
      ? 40 + neededItems.length * 40 + (omittedNeededCount > 0 ? 24 : 0)
      : 58;
  const skippedHeight =
    skippedItems.length > 0
      ? 38 + skippedItems.length * 24 + (omittedSkippedCount > 0 ? 22 : 0)
      : 0;
  const mealsHeight = meals.reduce(
    (total, meal) =>
      total +
      36 +
      Math.max(1, meal.items.length) * 23 +
      (meal.omittedCount > 0 ? 23 : 0),
    38,
  );

  return {
    neededItems,
    omittedNeededCount,
    skippedItems,
    omittedSkippedCount,
    meals,
    height: 220 + neededHeight + skippedHeight + mealsHeight + 130,
  };
}

function drawProcurementPoster(
  context: ReturnType<typeof Taro.createCanvasContext>,
  preview: ProcurementSharePreview,
  poster: PosterContent,
  miniProgramCodePath: string | null,
): void {
  context.setFillStyle("#fffaf4");
  context.fillRect(0, 0, POSTER_WIDTH, poster.height);
  context.setFillStyle("#d54836");
  context.fillRect(0, 0, POSTER_WIDTH, 8);

  context.setFillStyle("#d54836");
  context.setFontSize(12);
  context.fillText("家宴 · JIAYAN", 24, 38);
  context.setFillStyle("#8d857c");
  context.setFontSize(11);
  context.fillText(formatDate(preview.date), 24, 65);
  context.setFillStyle("#292521");
  context.setFontSize(25);
  context.fillText(`${rangeLabel(preview.mealTypes)}采购清单`, 24, 96);

  const neededCount = preview.items.filter((item) => item.needed).length;
  context.setFillStyle("#edf3e8");
  context.fillRect(24, 116, 158, 66);
  context.setFillStyle("#f1ece5");
  context.fillRect(193, 116, 158, 66);
  drawPosterStat(context, 40, neededCount, "项需要购买");
  drawPosterStat(
    context,
    209,
    preview.items.length - neededCount,
    "项无需购买",
  );

  let y = 219;
  context.setFillStyle("#292521");
  context.setFontSize(15);
  context.fillText("需要购买", 24, y);
  y += 20;

  if (poster.neededItems.length === 0) {
    context.setFillStyle("#55734c");
    context.setFontSize(12);
    context.fillText("家里都备好了，无需额外采购", 24, y + 18);
    y += 58;
  } else {
    for (const item of poster.neededItems) {
      context.setStrokeStyle("#6c8a61");
      context.strokeRect(24, y + 2, 13, 13);
      context.setFillStyle("#292521");
      context.setFontSize(12);
      context.fillText(
        fitCanvasText(
          context,
          `${item.displayName}  ${formatAmount(item)}`,
          290,
        ),
        47,
        y + 14,
      );
      context.setFillStyle("#8d857c");
      context.setFontSize(9);
      context.fillText(
        fitCanvasText(context, sourceLabel(item), 290),
        47,
        y + 29,
      );
      context.setStrokeStyle("#eee3d8");
      context.beginPath();
      context.moveTo(47, y + 38);
      context.lineTo(351, y + 38);
      context.stroke();
      y += 40;
    }
    if (poster.omittedNeededCount > 0) {
      drawOmittedText(context, y + 13, poster.omittedNeededCount);
      y += 24;
    }
  }

  if (poster.skippedItems.length > 0) {
    y += 14;
    context.setFillStyle("#8d857c");
    context.setFontSize(12);
    context.fillText("无需购买", 24, y);
    y += 16;
    for (const item of poster.skippedItems) {
      context.setFillStyle("#9b938a");
      context.setFontSize(10);
      context.fillText(
        fitCanvasText(
          context,
          `— ${item.displayName}  ${formatAmount(item)}`,
          327,
        ),
        24,
        y + 13,
      );
      y += 24;
    }
    if (poster.omittedSkippedCount > 0) {
      drawOmittedText(context, y + 11, poster.omittedSkippedCount);
      y += 22;
    }
  }

  y += 18;
  context.setStrokeStyle("#ded3c7");
  context.beginPath();
  context.moveTo(24, y);
  context.lineTo(351, y);
  context.stroke();
  y += 30;
  context.setFillStyle("#292521");
  context.setFontSize(15);
  context.fillText("分餐明细", 24, y);
  y += 15;

  for (const meal of poster.meals) {
    y += 18;
    context.setFillStyle("#d54836");
    context.setFontSize(11);
    context.fillText(mealLabel(meal.mealType), 24, y);
    if (meal.items.length === 0) {
      context.setFillStyle("#9b938a");
      context.setFontSize(10);
      context.fillText("本餐没有采购食材", 82, y);
      y += 23;
      continue;
    }
    for (const item of meal.items) {
      context.setFillStyle("#655d55");
      context.setFontSize(10);
      context.fillText(
        fitCanvasText(
          context,
          `${item.needed ? "□" : "—"} ${item.displayName} ${formatAmount(item)}`,
          269,
        ),
        82,
        y,
      );
      y += 23;
    }
    if (meal.omittedCount > 0) {
      context.setFillStyle("#9b938a");
      context.setFontSize(9);
      context.fillText(`另有 ${meal.omittedCount} 项`, 82, y);
      y += 23;
    }
  }

  drawPosterFooter(context, preview, poster.height, miniProgramCodePath);
}

function drawPosterFooter(
  context: ReturnType<typeof Taro.createCanvasContext>,
  preview: ProcurementSharePreview,
  height: number,
  miniProgramCodePath: string | null,
): void {
  context.setStrokeStyle("#ded3c7");
  context.beginPath();
  context.moveTo(24, height - 116);
  context.lineTo(351, height - 116);
  context.stroke();

  if (miniProgramCodePath) {
    context.setFillStyle("#8d857c");
    context.setFontSize(8);
    context.fillText(
      `根据当前家庭菜单生成 · 修订 ${preview.revision}`,
      24,
      height - 91,
    );
    context.setFillStyle("#d54836");
    context.setFontSize(12);
    context.fillText("微信扫码进入家宴", 24, height - 59);
    context.setFillStyle("#655d55");
    context.setFontSize(9);
    context.fillText("继续点菜、查看家庭菜单", 24, height - 39);
    context.drawImage(miniProgramCodePath, 288, height - 100, 64, 64);
    return;
  }

  context.setTextAlign("center");
  context.setFillStyle("#8d857c");
  context.setFontSize(9);
  context.fillText(
    `根据当前家庭菜单生成 · 修订 ${preview.revision}`,
    POSTER_WIDTH / 2,
    height - 67,
  );
  context.setFillStyle("#d54836");
  context.setFontSize(10);
  context.fillText(
    "家宴 · 把每一道家常菜都越做越好",
    POSTER_WIDTH / 2,
    height - 43,
  );
  context.setTextAlign("left");
}

function drawPosterStat(
  context: ReturnType<typeof Taro.createCanvasContext>,
  x: number,
  count: number,
  label: string,
): void {
  context.setFillStyle("#292521");
  context.setFontSize(24);
  context.fillText(String(count), x, 146);
  context.setFillStyle("#8d857c");
  context.setFontSize(9);
  context.fillText(label, x, 166);
}

function drawOmittedText(
  context: ReturnType<typeof Taro.createCanvasContext>,
  y: number,
  omittedCount: number,
): void {
  context.setFillStyle("#9b938a");
  context.setFontSize(9);
  context.fillText(`清单较长，另有 ${omittedCount} 项请在小程序内查看`, 47, y);
}

function sourceLabel(item: ProcurementItemResponse): string {
  return [
    ...new Set(
      item.sources.map(
        (source) => `${mealLabel(source.mealType)} · ${source.recipeName}`,
      ),
    ),
  ].join("、");
}

function fitCanvasText(
  context: ReturnType<typeof Taro.createCanvasContext>,
  value: string,
  maxWidth: number,
): string {
  if (context.measureText(value).width <= maxWidth) return value;
  let result = "";
  for (const character of value) {
    if (context.measureText(`${result}${character}…`).width > maxWidth) break;
    result += character;
  }
  return `${result}…`;
}

async function ensurePhotoAlbumPermission(): Promise<boolean> {
  const settings = await Taro.getSetting();
  const current = settings.authSetting["scope.writePhotosAlbum"];
  if (current === true) return true;
  if (current === undefined) {
    try {
      await Taro.authorize({ scope: "scope.writePhotosAlbum" });
      return true;
    } catch {
      // The user can still enable access from the settings page below.
    }
  }

  const decision = await Taro.showModal({
    title: "需要相册权限",
    content: "保存采购清单图片需要写入系统相册，你可以在设置中允许。",
    confirmText: "去设置",
  });
  if (!decision.confirm) return false;
  const updated = await Taro.openSetting();
  return updated.authSetting["scope.writePhotosAlbum"] === true;
}

function waitForCanvasUpdate(): Promise<void> {
  return new Promise((resolve) => {
    Taro.nextTick(() => setTimeout(resolve, 40));
  });
}
