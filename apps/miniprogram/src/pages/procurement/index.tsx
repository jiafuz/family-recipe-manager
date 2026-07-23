import type {
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

export default function ProcurementPage(): JSX.Element {
  const router = useRouter();
  const kitchenId = router.params.kitchenId ?? "";
  const date = router.params.date ?? "";
  const [list, setList] = useState<ProcurementList | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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

  const groups = useMemo(() => {
    const result = new Map<string, ProcurementItemResponse[]>();
    for (const item of list?.items ?? []) {
      const group = result.get(item.category) ?? [];
      group.push(item);
      result.set(item.category, group);
    }
    return [...result.entries()];
  }, [list]);

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

  return (
    <View className="procurement-page">
      <View className="procurement-header">
        <Button onClick={() => Taro.navigateBack()}>‹</Button>
        <View>
          <Text>采购清单</Text>
          <Text>{formatDate(date)} · 全天</Text>
        </View>
        <Text />
      </View>

      {loading ? (
        <View className="procurement-state">正在汇总食材…</View>
      ) : null}
      {errorMessage ? (
        <View className="procurement-state">{errorMessage}</View>
      ) : null}
      {!loading && !errorMessage && list?.items.length === 0 ? (
        <View className="procurement-state">
          <Text>当天还没有采购食材</Text>
          <Text>保存菜单后，采购清单会自动出现在这里</Text>
        </View>
      ) : null}
      {list && list.items.length > 0 ? (
        <View className="procurement-content">
          <View className="procurement-summary">
            <View>
              <Text>{list.items.filter((item) => item.needed).length}</Text>
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
    </View>
  );
}

function formatAmount(item: ProcurementItemResponse): string {
  if (item.totalQuantity === null) return item.unit || "适量";
  return `${item.totalQuantity}${item.unit ?? ""}`;
}

function mealLabel(mealType: "breakfast" | "lunch" | "dinner"): string {
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
