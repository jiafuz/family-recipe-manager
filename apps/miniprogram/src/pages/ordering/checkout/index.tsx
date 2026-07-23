import type { MealPlanItem, MealType } from "@jiayan/contracts";
import {
  Button,
  Input,
  Picker,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";

import {
  clearOrderingDraft,
  clearOrderingEditContext,
  loadOrderingDraft,
  loadOrderingEditContext,
  type OrderingDraftItem,
  type OrderingEditContext,
  saveMealRecordFocus,
  saveOrderingDraft,
} from "../../../features/ordering/draft";
import {
  ApiClientError,
  getMealPlan,
  saveMealPlan,
} from "../../../services/api-client";

import "./index.scss";

type CheckoutPhase = "cart" | "schedule" | "confirm";

interface CheckoutItem extends OrderingDraftItem {
  key: string;
  itemId?: string;
  existing: boolean;
  orderedByName?: string;
  orderedAt?: string;
}

const mealTypes: Array<{ value: MealType; label: string; time: string }> = [
  { value: "breakfast", label: "早餐", time: "07:30" },
  { value: "lunch", label: "午餐", time: "12:00" },
  { value: "dinner", label: "晚餐", time: "18:30" },
];

export default function OrderingCheckoutPage(): JSX.Element {
  const [phase, setPhase] = useState<CheckoutPhase>("cart");
  const [kitchenId, setKitchenId] = useState("");
  const [draftItems, setDraftItems] = useState<OrderingDraftItem[]>([]);
  const [editContext, setEditContext] = useState<OrderingEditContext | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(null);
  const [combinedItems, setCombinedItems] = useState<CheckoutItem[]>([]);
  const [menuVersion, setMenuVersion] = useState(0);
  const [mealNote, setMealNote] = useState("");
  const [completed, setCompleted] = useState(false);
  const [loadingSlot, setLoadingSlot] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const draft = loadOrderingDraft();
    if (!draft) {
      void Taro.showToast({ title: "请先选择菜品", icon: "none" });
      setTimeout(() => void Taro.navigateBack(), 400);
      return;
    }
    setKitchenId(draft.kitchenId);
    setDraftItems(draft.items);
    const storedEditContext = loadOrderingEditContext();
    if (storedEditContext?.kitchenId === draft.kitchenId) {
      setEditContext(storedEditContext);
      setSelectedDate(storedEditContext.date);
      setSelectedMeal(storedEditContext.mealType);
      setLoadingSlot(true);
      void getMealPlan(
        draft.kitchenId,
        storedEditContext.date,
        storedEditContext.mealType,
      )
        .then((existing) => {
          if (!existing) {
            clearOrderingEditContext();
            setEditContext(null);
            setPhase("cart");
            return;
          }
          setMenuVersion(existing.version);
          setMealNote(existing.mealNote ?? "");
          setCompleted(existing.status === "completed");
          const existingById = new Map(
            existing.items.map((item) => [item.id, item]),
          );
          setCombinedItems(
            draft.items.map((item) => {
              const existingItem = item.itemId
                ? existingById.get(item.itemId)
                : undefined;
              return {
                ...item,
                key: existingItem
                  ? `existing-${existingItem.id}`
                  : `new-${item.recipeId}`,
                ...(existingItem ? { itemId: existingItem.id } : {}),
                existing: Boolean(existingItem),
                ...(existingItem
                  ? {
                      orderedByName: existingItem.orderedBy.displayName,
                      orderedAt: existingItem.orderedAt,
                    }
                  : {}),
              };
            }),
          );
          setPhase("confirm");
        })
        .catch((error: unknown) => {
          void Taro.showToast({
            title: getErrorMessage(error),
            icon: "none",
          });
        })
        .finally(() => setLoadingSlot(false));
    }
  }, []);

  const dateOptions = useMemo(() => {
    const values = [0, 1, 2].map((offset) => addDays(today(), offset));
    return values.map((value, index) => ({
      value,
      label: ["今天", "明天", "后天"][index]!,
      dateLabel: formatShortDate(value),
    }));
  }, []);

  const updateDraftItem = (
    recipeId: string,
    updater: (item: OrderingDraftItem) => OrderingDraftItem,
  ): void => {
    setDraftItems((current) => {
      const next = current.map((item) =>
        item.recipeId === recipeId ? updater(item) : item,
      );
      if (kitchenId) saveOrderingDraft({ kitchenId, items: next });
      return next;
    });
  };

  const removeDraftItem = (recipeId: string): void => {
    setDraftItems((current) => {
      const next = current.filter((item) => item.recipeId !== recipeId);
      if (next.length > 0 && kitchenId) {
        saveOrderingDraft({ kitchenId, items: next });
      } else {
        clearOrderingDraft();
      }
      return next;
    });
  };

  const selectMeal = async (mealType: MealType): Promise<void> => {
    if (!kitchenId) return;
    setSelectedMeal(mealType);
    setLoadingSlot(true);
    try {
      const existing = await getMealPlan(kitchenId, selectedDate, mealType);
      setMenuVersion(existing?.version ?? 0);
      setMealNote(existing?.mealNote ?? "");
      setCompleted(existing?.status === "completed");
      const existingItems = existing?.items.map(toExistingCheckoutItem) ?? [];
      const newItems = draftItems.map((item) => ({
        ...item,
        key: `new-${item.recipeId}`,
        existing: false,
      }));
      setCombinedItems([...existingItems, ...newItems]);
      setPhase("confirm");
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setLoadingSlot(false);
    }
  };

  const updateCombinedItem = (
    key: string,
    updater: (item: CheckoutItem) => CheckoutItem,
  ): void => {
    setCombinedItems((current) =>
      current.map((item) => (item.key === key ? updater(item) : item)),
    );
  };

  const handleSubmit = async (): Promise<void> => {
    if (!kitchenId || !selectedMeal || combinedItems.length === 0) return;
    setSaving(true);
    try {
      await saveMealPlan(kitchenId, selectedDate, selectedMeal, {
        version: menuVersion,
        mealNote: mealNote.trim() || null,
        items: combinedItems.map((item) => ({
          ...(item.itemId ? { itemId: item.itemId } : {}),
          recipeId: item.recipeId,
          recipeVersionId: item.recipeVersionId,
          quantity: item.quantity,
          tasteNote: item.tasteNote,
        })),
      });
      clearOrderingDraft();
      clearOrderingEditContext();
      saveMealRecordFocus({ date: selectedDate, mealType: selectedMeal });
      await Taro.showToast({
        title: "菜单已保存，采购清单已同步",
        icon: "none",
      });
      setTimeout(
        () => void Taro.switchTab({ url: "/pages/meal-records/index" }),
        500,
      );
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "MEAL_PLAN_VERSION_CONFLICT"
      ) {
        await Taro.showModal({
          title: "菜单已经变化",
          content: "有家人刚刚修改了本餐，请返回选择时间后重新查看最新菜单。",
          showCancel: false,
        });
        if (editContext) {
          clearOrderingDraft();
          clearOrderingEditContext();
          saveMealRecordFocus({
            date: editContext.date,
            mealType: editContext.mealType,
          });
          await Taro.switchTab({ url: "/pages/meal-records/index" });
        } else {
          setPhase("schedule");
        }
      } else {
        await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBack = (): void => {
    if (phase === "confirm") {
      if (editContext) {
        void Taro.navigateBack();
        return;
      }
      setPhase("schedule");
      return;
    }
    if (phase === "schedule") {
      setPhase("cart");
      return;
    }
    void Taro.navigateBack();
  };

  const handleClose = async (): Promise<void> => {
    const result = await Taro.showModal({
      title: "退出本次点菜？",
      content: "已选菜品会保留在点菜页，之后可以继续。",
      confirmText: "退出",
    });
    if (result.confirm) {
      await Taro.switchTab({ url: "/pages/ordering/index" });
    }
  };

  return (
    <View className="checkout-page">
      <View className="checkout-header">
        <Button onClick={handleBack}>‹ 返回</Button>
        <Text>
          {phase === "cart"
            ? "已选菜单"
            : phase === "schedule"
              ? "选择日期与餐次"
              : editContext
                ? "编辑本餐"
                : "本餐菜单"}
        </Text>
        <Button onClick={handleClose}>×</Button>
      </View>

      {phase === "cart" ? (
        <View className="checkout-content">
          <View className="checkout-intro">
            <Text>共 {draftItems.length} 道菜</Text>
            <Text>可调整数量，并为每道菜填写口味</Text>
          </View>
          <View className="checkout-menu-card">
            {draftItems.map((item) => (
              <View className="checkout-dish" key={item.recipeId}>
                <Text className="checkout-dish__cover">{item.coverEmoji}</Text>
                <View className="checkout-dish__body">
                  <View className="checkout-dish__line">
                    <Text className="checkout-dish__name">{item.name}</Text>
                    <View className="checkout-quantity">
                      <Button
                        onClick={() =>
                          item.quantity === 1
                            ? removeDraftItem(item.recipeId)
                            : updateDraftItem(item.recipeId, (current) => ({
                                ...current,
                                quantity: current.quantity - 1,
                              }))
                        }
                      >
                        −
                      </Button>
                      <Text>{item.quantity}</Text>
                      <Button
                        onClick={() =>
                          updateDraftItem(item.recipeId, (current) => ({
                            ...current,
                            quantity: Math.min(20, current.quantity + 1),
                          }))
                        }
                      >
                        ＋
                      </Button>
                    </View>
                  </View>
                  <Input
                    value={item.tasteNote ?? ""}
                    placeholder="口味备注（选填），如少盐、不辣"
                    onInput={(event) =>
                      updateDraftItem(item.recipeId, (current) => ({
                        ...current,
                        tasteNote: event.detail.value.trim() || null,
                      }))
                    }
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {phase === "schedule" ? (
        <View className="checkout-content">
          <Text className="checkout-section-title">哪一天吃？</Text>
          <View className="checkout-date-options">
            {dateOptions.map((option) => (
              <Button
                className={selectedDate === option.value ? "is-active" : ""}
                key={option.value}
                onClick={() => setSelectedDate(option.value)}
              >
                <Text>{option.label}</Text>
                <Text>{option.dateLabel}</Text>
              </Button>
            ))}
            <Picker
              mode="date"
              value={selectedDate}
              start={today()}
              onChange={(event) => setSelectedDate(event.detail.value)}
            >
              <View
                className={`checkout-custom-date ${
                  dateOptions.some((item) => item.value === selectedDate)
                    ? ""
                    : "is-active"
                }`}
              >
                <Text>选择日期</Text>
                <Text>
                  {dateOptions.some((item) => item.value === selectedDate)
                    ? "打开日历"
                    : formatShortDate(selectedDate)}
                </Text>
              </View>
            </Picker>
          </View>
          <Text className="checkout-section-title">哪一餐？</Text>
          <View className="checkout-meal-options">
            {mealTypes.map((meal) => (
              <Button
                loading={loadingSlot && selectedMeal === meal.value}
                key={meal.value}
                onClick={() => void selectMeal(meal.value)}
              >
                <Text>{meal.label}</Text>
                <Text>{meal.time}</Text>
              </Button>
            ))}
          </View>
          <Text className="checkout-schedule-tip">
            选择餐次后会同时展示家人已经点过的菜，再统一确认。
          </Text>
        </View>
      ) : null}

      {phase === "confirm" ? (
        <View className="checkout-content checkout-confirm">
          <View className="checkout-slot-summary">
            <View>
              <Text>{formatLongDate(selectedDate)}</Text>
              <Text>
                {mealTypes.find((item) => item.value === selectedMeal)?.label}
              </Text>
            </View>
            <Text>{combinedItems.length} 道菜</Text>
          </View>
          {completed ? (
            <Text className="checkout-completed-tip">
              本餐已经完成，只能查看，不能继续修改。
            </Text>
          ) : null}
          <View className="checkout-menu-card">
            {combinedItems.map((item) => (
              <View className="checkout-dish" key={item.key}>
                <Text className="checkout-dish__cover">{item.coverEmoji}</Text>
                <View className="checkout-dish__body">
                  <View className="checkout-dish__line">
                    <View>
                      <Text className="checkout-dish__name">{item.name}</Text>
                      <Text className="checkout-dish__source">
                        {item.existing
                          ? `${item.orderedByName ?? "家人"} 已点`
                          : "本次新增"}
                      </Text>
                    </View>
                    {!completed ? (
                      <View className="checkout-quantity">
                        <Button
                          onClick={() =>
                            item.quantity === 1
                              ? setCombinedItems((current) =>
                                  current.filter(
                                    (entry) => entry.key !== item.key,
                                  ),
                                )
                              : updateCombinedItem(item.key, (current) => ({
                                  ...current,
                                  quantity: current.quantity - 1,
                                }))
                          }
                        >
                          −
                        </Button>
                        <Text>{item.quantity}</Text>
                        <Button
                          onClick={() =>
                            updateCombinedItem(item.key, (current) => ({
                              ...current,
                              quantity: Math.min(20, current.quantity + 1),
                            }))
                          }
                        >
                          ＋
                        </Button>
                      </View>
                    ) : (
                      <Text className="checkout-dish__readonly-count">
                        ×{item.quantity}
                      </Text>
                    )}
                  </View>
                  <Input
                    disabled={completed}
                    value={item.tasteNote ?? ""}
                    placeholder="口味备注（选填）"
                    onInput={(event) =>
                      updateCombinedItem(item.key, (current) => ({
                        ...current,
                        tasteNote: event.detail.value.trim() || null,
                      }))
                    }
                  />
                </View>
              </View>
            ))}
          </View>
          <View className="checkout-meal-note">
            <Text>给这一餐的备注</Text>
            <Textarea
              disabled={completed}
              maxlength={500}
              value={mealNote}
              placeholder="例如：奶奶也一起吃，整体清淡些"
              onInput={(event) => setMealNote(event.detail.value)}
            />
          </View>
        </View>
      ) : null}

      {phase === "cart" ? (
        <View className="checkout-footer">
          <Button
            disabled={draftItems.length === 0}
            onClick={() => setPhase("schedule")}
          >
            选择点餐时间
          </Button>
        </View>
      ) : null}
      {phase === "confirm" && !completed ? (
        <View className="checkout-footer">
          <Button
            loading={saving}
            disabled={saving || combinedItems.length === 0}
            onClick={handleSubmit}
          >
            提交订单
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function toExistingCheckoutItem(item: MealPlanItem): CheckoutItem {
  return {
    key: `existing-${item.id}`,
    itemId: item.id,
    recipeId: item.recipeId,
    recipeVersionId: item.recipeVersionId,
    name: item.recipeName,
    coverEmoji: item.coverEmoji,
    quantity: item.quantity,
    tasteNote: item.tasteNote,
    existing: true,
    orderedByName: item.orderedBy.displayName,
    orderedAt: item.orderedAt,
  };
}

function today(): string {
  return formatLocalDate(new Date());
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return formatLocalDate(value);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function formatLongDate(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    value.getDay()
  ];
  return `${formatShortDate(date)} · ${weekday}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}
