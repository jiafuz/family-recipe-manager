import type {
  MealType,
  ProcurementItemResponse,
  ProcurementList,
} from "@jiayan/contracts";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";

import {
  ApiClientError,
  getProcurementList,
  updateProcurementNeeded,
} from "../../services/api-client";

import "./index.scss";

const categoryLabels: Record<string, { label: string; icon: string }> = {
  vegetable: { label: "蔬菜菌菇", icon: "🥬" },
  meat: { label: "肉禽", icon: "🥩" },
  fish: { label: "水产", icon: "🐟" },
  egg: { label: "蛋奶", icon: "🥚" },
  staple: { label: "主食", icon: "🍚" },
  seasoning: { label: "调味", icon: "🧂" },
  other: { label: "其它", icon: "🧺" },
};

const mealOptions: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "早餐" },
  { value: "lunch", label: "午餐" },
  { value: "dinner", label: "晚餐" },
];

type ViewScope = "all" | MealType;

export default function ProcurementPage(): JSX.Element {
  const router = useRouter();
  const kitchenId = router.params.kitchenId ?? "";
  const date = router.params.date ?? "";
  const [list, setList] = useState<ProcurementList | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [viewScope, setViewScope] = useState<ViewScope>("all");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMealTypes, setShareMealTypes] = useState<MealType[]>([
    "breakfast",
    "lunch",
    "dinner",
  ]);

  useEffect(() => {
    if (!kitchenId || !date) {
      setErrorMessage("缺少采购清单日期");
      setLoading(false);
      return;
    }
    void getProcurementList(kitchenId, date)
      .then(setList)
      .catch((error) => setErrorMessage(getErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [date, kitchenId]);

  const scopedItems = useMemo(
    () =>
      list
        ? filterItemsByMealTypes(
            list.items,
            viewScope === "all"
              ? mealOptions.map((item) => item.value)
              : [viewScope],
          )
        : [],
    [list, viewScope],
  );

  const groups = useMemo(() => {
    const result = new Map<string, ProcurementItemResponse[]>();
    for (const item of scopedItems) {
      const group = result.get(item.category) ?? [];
      group.push(item);
      result.set(item.category, group);
    }
    return [...result.entries()];
  }, [scopedItems]);

  const toggleNeeded = async (item: ProcurementItemResponse): Promise<void> => {
    if (!kitchenId || !date || updatingId) return;
    setUpdatingId(item.id);
    try {
      setList(
        await updateProcurementNeeded(kitchenId, date, item.id, !item.needed),
      );
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setUpdatingId("");
    }
  };

  const toggleShareMeal = (mealType: MealType): void => {
    setShareMealTypes((current) =>
      current.includes(mealType)
        ? current.filter((item) => item !== mealType)
        : mealOptions
            .map((item) => item.value)
            .filter((item) => [...current, mealType].includes(item)),
    );
  };

  const openSharePreview = (): void => {
    if (!kitchenId || !date || shareMealTypes.length === 0) return;
    setShareOpen(false);
    void Taro.navigateTo({
      url: `/pages/procurement/share/index?kitchenId=${encodeURIComponent(kitchenId)}&date=${encodeURIComponent(date)}&mealTypes=${encodeURIComponent(shareMealTypes.join(","))}`,
    });
  };

  return (
    <View className="procurement-page">
      <View className="procurement-header">
        <Button onClick={() => Taro.navigateBack()}>‹</Button>
        <View>
          <Text>采购清单</Text>
          <Text>
            {formatDate(date)} · {scopeLabel(viewScope)}
          </Text>
        </View>
        <Text />
      </View>

      <View className="procurement-scope-tabs">
        <Button
          className={viewScope === "all" ? "is-active" : ""}
          onClick={() => setViewScope("all")}
        >
          全天
        </Button>
        {mealOptions.map((meal) => (
          <Button
            className={viewScope === meal.value ? "is-active" : ""}
            key={meal.value}
            onClick={() => setViewScope(meal.value)}
          >
            {meal.label}
          </Button>
        ))}
      </View>

      {loading ? (
        <View className="procurement-state">正在汇总食材…</View>
      ) : null}
      {errorMessage ? (
        <View className="procurement-state">{errorMessage}</View>
      ) : null}
      {!loading && !errorMessage && scopedItems.length === 0 ? (
        <View className="procurement-state">
          <Text>
            {viewScope === "all" ? "当天" : scopeLabel(viewScope)}还没有采购食材
          </Text>
          <Text>保存菜单后，采购清单会自动同步</Text>
        </View>
      ) : null}
      {list && scopedItems.length > 0 ? (
        <View className="procurement-content">
          <View className="procurement-summary">
            <View>
              <Text>{scopedItems.filter((item) => item.needed).length}</Text>
              <Text>项需要购买</Text>
            </View>
            <Text>默认全部列入购买，家里已有的直接取消勾选</Text>
          </View>

          {groups.map(([category, items]) => {
            const categoryMeta =
              categoryLabels[category] ?? categoryLabels.other!;
            return (
              <View
                className={`procurement-group procurement-group--${category}`}
                key={category}
              >
                <View className="procurement-group__title">
                  <Text>{categoryMeta.icon}</Text>
                  <Text>{categoryMeta.label}</Text>
                  <Text>{items.length} 项</Text>
                </View>
                {items.map((item) => (
                  <View
                    className={`procurement-item ${
                      item.needed ? "is-needed" : ""
                    }`}
                    key={item.id}
                    onClick={() => void toggleNeeded(item)}
                  >
                    <Text className="procurement-item__check">
                      {updatingId === item.id ? "…" : item.needed ? "✓" : ""}
                    </Text>
                    <View className="procurement-item__copy">
                      <View>
                        <Text>{item.displayName}</Text>
                        <Text>{formatAmount(item)}</Text>
                      </View>
                      <Text>
                        {item.sources
                          .map(
                            (source) =>
                              `${mealLabel(source.mealType)} · ${source.recipeName}`,
                          )
                          .join("、")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
          <Text className="procurement-revision">
            根据当前菜单自动生成 · 修订 {list.revision}
          </Text>
        </View>
      ) : null}

      {list && list.items.length > 0 ? (
        <View className="procurement-share-footer">
          <Button onClick={() => setShareOpen(true)}>分享采购清单</Button>
        </View>
      ) : null}

      {shareOpen ? (
        <View
          className="procurement-share-mask"
          onClick={() => setShareOpen(false)}
        >
          <View
            className="procurement-share-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <View className="procurement-share-sheet__heading">
              <View>
                <Text>选择分享范围</Text>
                <Text>默认分享全天，也可以自由组合几餐</Text>
              </View>
              <Button onClick={() => setShareOpen(false)}>×</Button>
            </View>
            <View className="procurement-share-options">
              {mealOptions.map((meal) => {
                const selected = shareMealTypes.includes(meal.value);
                const count = countMealItems(list?.items ?? [], meal.value);
                return (
                  <Button
                    className={selected ? "is-selected" : ""}
                    key={meal.value}
                    onClick={() => toggleShareMeal(meal.value)}
                  >
                    <Text>{selected ? "✓" : ""}</Text>
                    <View>
                      <Text>{meal.label}</Text>
                      <Text>{count} 项食材</Text>
                    </View>
                  </Button>
                );
              })}
            </View>
            <Text className="procurement-share-sheet__summary">
              {shareMealTypes.length === 3
                ? "将生成全天合并清单，并附早、中、晚餐明细"
                : shareMealTypes.length > 0
                  ? `将合并${shareMealTypes.map(mealLabel).join("、")}采购清单`
                  : "请至少选择一个餐次"}
            </Text>
            <Button
              className="procurement-share-sheet__primary"
              disabled={shareMealTypes.length === 0}
              onClick={openSharePreview}
            >
              预览并分享
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function filterItemsByMealTypes(
  items: ProcurementItemResponse[],
  mealTypes: MealType[],
): ProcurementItemResponse[] {
  const selected = new Set(mealTypes);
  return items.flatMap((item) => {
    const sources = item.sources.filter((source) =>
      selected.has(source.mealType),
    );
    if (sources.length === 0) return [];
    return [
      {
        ...item,
        totalQuantity: sources.every((source) => source.quantity !== null)
          ? sources.reduce((total, source) => total + source.quantity!, 0)
          : null,
        sources,
      },
    ];
  });
}

function countMealItems(
  items: ProcurementItemResponse[],
  mealType: MealType,
): number {
  return items.filter((item) =>
    item.sources.some((source) => source.mealType === mealType),
  ).length;
}

function scopeLabel(scope: ViewScope): string {
  return scope === "all" ? "全天" : mealLabel(scope);
}

function formatAmount(item: ProcurementItemResponse): string {
  if (item.totalQuantity === null) return item.unit || "适量";
  return `${item.totalQuantity}${item.unit ?? ""}`;
}

function mealLabel(mealType: MealType): string {
  return { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" }[mealType];
}

function formatDate(date: string): string {
  const [, month, day] = date.split("-");
  return date ? `${Number(month)}月${Number(day)}日` : "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}
