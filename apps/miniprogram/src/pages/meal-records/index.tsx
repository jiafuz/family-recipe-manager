import type {
  KitchenSummary,
  MealPlanDetail,
  MealPhoto,
  MealType,
} from "@jiayan/contracts";
import { Button, Image, Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useMemo, useState } from "react";

import { KitchenToolbar } from "../../components/kitchen-toolbar";
import {
  consumeMealRecordFocus,
  saveOrderingDraft,
  saveOrderingEditContext,
} from "../../features/ordering/draft";
import {
  ApiClientError,
  addMealPhotos,
  completeMealPlan,
  ensureSignedIn,
  getMealPlan,
  getStoredCurrentKitchenId,
  listMealPhotos,
} from "../../services/api-client";
import { uploadMealPhoto } from "../../services/media-upload";

import "./index.scss";

const mealTypes: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "早餐" },
  { value: "lunch", label: "午餐" },
  { value: "dinner", label: "晚餐" },
];

export default function MealRecordsPage(): JSX.Element {
  const [kitchen, setKitchen] = useState<KitchenSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedMeal, setSelectedMeal] = useState<MealType>(nearbyMeal());
  const [mealPlan, setMealPlan] = useState<MealPlanDetail | null>(null);
  const [photos, setPhotos] = useState<MealPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const currentUser = await ensureSignedIn();
      const storedId = getStoredCurrentKitchenId();
      const selectedKitchen =
        currentUser.kitchens.find((item) => item.id === storedId) ??
        currentUser.currentKitchen ??
        currentUser.kitchens[0];
      if (!selectedKitchen) {
        await Taro.switchTab({ url: "/pages/ordering/index" });
        return;
      }
      const focus = consumeMealRecordFocus();
      const date = focus?.date ?? selectedDate;
      const mealType = focus?.mealType ?? selectedMeal;
      setKitchen(selectedKitchen);
      setSelectedDate(date);
      setSelectedMeal(mealType);
      const plan = await getMealPlan(selectedKitchen.id, date, mealType);
      setMealPlan(plan);
      setPhotos(
        plan?.status === "completed" ? await listMealPhotos(plan.id) : [],
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedMeal]);

  useDidShow(() => {
    void load();
  });

  const switchSlot = async (
    date: string,
    mealType: MealType,
  ): Promise<void> => {
    setSelectedDate(date);
    setSelectedMeal(mealType);
    if (!kitchen) return;
    setLoading(true);
    try {
      const plan = await getMealPlan(kitchen.id, date, mealType);
      setMealPlan(plan);
      setPhotos(
        plan?.status === "completed" ? await listMealPhotos(plan.id) : [],
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const dateOptions = useMemo(
    () =>
      [0, 1, 2].map((offset, index) => {
        const value = addDays(today(), offset);
        return {
          value,
          label: ["今天", "明天", "后天"][index]!,
          short: formatShortDate(value),
        };
      }),
    [],
  );

  const openProcurement = (): void => {
    if (!kitchen) return;
    void Taro.navigateTo({
      url: `/pages/procurement/index?kitchenId=${encodeURIComponent(kitchen.id)}&date=${selectedDate}`,
    });
  };

  const editMeal = (): void => {
    if (!kitchen || !mealPlan || mealPlan.status === "completed") return;
    saveOrderingDraft({
      kitchenId: kitchen.id,
      items: mealPlan.items.map((item) => ({
        itemId: item.id,
        recipeId: item.recipeId,
        recipeVersionId: item.recipeVersionId,
        name: item.recipeName,
        coverEmoji: item.coverEmoji,
        quantity: item.quantity,
        tasteNote: item.tasteNote,
      })),
    });
    saveOrderingEditContext({
      kitchenId: kitchen.id,
      date: selectedDate,
      mealType: selectedMeal,
    });
    void Taro.switchTab({ url: "/pages/ordering/index" });
  };

  const handleCompleteMeal = async (): Promise<void> => {
    if (!kitchen || !mealPlan || mealPlan.status === "completed") return;
    const result = await Taro.showModal({
      title: "确认完成本餐？",
      content: "完成后菜单将变为只读，之后仍可补充成品照。",
      confirmText: "完成本餐",
    });
    if (!result.confirm) return;
    setCompleting(true);
    try {
      const completedPlan = await completeMealPlan(
        kitchen.id,
        selectedDate,
        selectedMeal,
        mealPlan.version,
      );
      setMealPlan(completedPlan);
      setPhotos(await listMealPhotos(completedPlan.id));
      await Taro.showToast({ title: "本餐已完成", icon: "success" });
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
      await switchSlot(selectedDate, selectedMeal);
    } finally {
      setCompleting(false);
    }
  };

  const handleAddPhotos = async (): Promise<void> => {
    if (!kitchen || !mealPlan || mealPlan.status !== "completed") return;
    try {
      const selection = await Taro.chooseMedia({
        count: 9,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      if (selection.tempFiles.length === 0) return;
      setUploadingPhotos(true);
      const mediaAssetIds: string[] = [];
      for (const file of selection.tempFiles) {
        mediaAssetIds.push(
          await uploadMealPhoto(kitchen.id, {
            tempFilePath: file.tempFilePath,
            size: file.size,
          }),
        );
      }
      setPhotos(
        await addMealPhotos(mealPlan.id, {
          photos: mediaAssetIds.map((mediaAssetId) => ({
            mediaAssetId,
            mealItemId: null,
            caption: null,
          })),
        }),
      );
      await Taro.showToast({ title: "成品照已添加", icon: "success" });
    } catch (error) {
      if (isUserCancellation(error)) return;
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const openPhotoEditor = (photo: MealPhoto): void => {
    if (!mealPlan) return;
    void Taro.navigateTo({
      url: `/pages/meal-photo-editor/index?mealPlanId=${mealPlan.id}&photoId=${photo.id}`,
    });
  };

  return (
    <View className="meal-records-page">
      <KitchenToolbar
        kitchenId={kitchen?.id}
        kitchenName={kitchen?.name ?? "我的家"}
        memberCount={kitchen?.memberCount ?? 1}
      />
      <View className="meal-record-date-options">
        {dateOptions.map((option) => (
          <Button
            className={selectedDate === option.value ? "is-active" : ""}
            key={option.value}
            onClick={() => void switchSlot(option.value, selectedMeal)}
          >
            <Text>{option.label}</Text>
            <Text>{option.short}</Text>
          </Button>
        ))}
        <Picker
          mode="date"
          value={selectedDate}
          onChange={(event) =>
            void switchSlot(event.detail.value, selectedMeal)
          }
        >
          <View
            className={`meal-record-custom-date ${
              dateOptions.some((item) => item.value === selectedDate)
                ? ""
                : "is-active"
            }`}
          >
            <Text>选择日期</Text>
            <Text>
              {dateOptions.some((item) => item.value === selectedDate)
                ? "查看日历"
                : formatShortDate(selectedDate)}
            </Text>
          </View>
        </Picker>
      </View>

      <View className="meal-record-meal-tabs">
        {mealTypes.map((meal) => (
          <Button
            className={selectedMeal === meal.value ? "is-active" : ""}
            key={meal.value}
            onClick={() => void switchSlot(selectedDate, meal.value)}
          >
            {meal.label}
          </Button>
        ))}
      </View>

      <View className="meal-record-heading">
        <View>
          <Text>{dateHeading(selectedDate)}的菜单</Text>
          <Text>{formatShortDate(selectedDate)}</Text>
        </View>
        {selectedDate >= today() ? (
          <Button onClick={openProcurement}>🧺 采购清单</Button>
        ) : null}
      </View>

      {errorMessage ? (
        <View className="meal-record-state">
          <Text>{errorMessage}</Text>
          <Button onClick={load}>重新加载</Button>
        </View>
      ) : null}
      {loading ? (
        <View className="meal-record-state">正在读取家庭菜单…</View>
      ) : null}
      {!loading && !errorMessage && !mealPlan ? (
        <View className="meal-record-empty">
          <Text>这一餐还没有点菜</Text>
          <Text>去我家菜谱里挑几道想吃的菜吧</Text>
          <Button
            onClick={() => Taro.switchTab({ url: "/pages/ordering/index" })}
          >
            去点菜
          </Button>
        </View>
      ) : null}
      {!loading && mealPlan ? (
        <View className="meal-record-card">
          {mealPlan.items.map((item) => (
            <View className="meal-record-dish" key={item.id}>
              <Text className="meal-record-dish__cover">{item.coverEmoji}</Text>
              <View className="meal-record-dish__copy">
                <View>
                  <Text className="meal-record-dish__name">
                    {item.recipeName}
                  </Text>
                  <Text>×{item.quantity}</Text>
                </View>
                <Text className="meal-record-dish__meta">
                  {item.orderedBy.displayName} · {formatTime(item.orderedAt)}{" "}
                  点餐
                </Text>
                {item.tasteNote ? (
                  <Text className="meal-record-dish__note">
                    备注：{item.tasteNote}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {mealPlan.mealNote ? (
            <Text className="meal-record-card__note">
              整餐备注：{mealPlan.mealNote}
            </Text>
          ) : null}
          <View className="meal-record-card__footer">
            <Text>
              {mealPlan.status === "completed"
                ? "本餐已完成"
                : "采购清单已同步"}
            </Text>
            {mealPlan.status !== "completed" && selectedDate === today() ? (
              <View className="meal-record-card__actions">
                <Button onClick={editMeal}>编辑菜单</Button>
                <Button
                  className="is-primary"
                  loading={completing}
                  disabled={completing}
                  onClick={handleCompleteMeal}
                >
                  完成本餐
                </Button>
              </View>
            ) : mealPlan.status !== "completed" && selectedDate > today() ? (
              <Button onClick={editMeal}>编辑菜单</Button>
            ) : (
              <Text>菜单版本 V{mealPlan.version}</Text>
            )}
          </View>
          {mealPlan.status === "completed" ? (
            <View className="meal-record-photos">
              {photos.length > 0 ? (
                <View className="meal-record-photo-grid">
                  {photos.map((photo) => (
                    <View
                      className="meal-record-photo"
                      key={photo.id}
                      onClick={() => openPhotoEditor(photo)}
                    >
                      <Image mode="aspectFill" src={photo.media.url} />
                      <Text>{getPhotoAssociation(photo, mealPlan)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="meal-record-photos__hint">
                  成品照是可选的，想记录时再添加
                </Text>
              )}
              <View className="meal-record-photo-actions">
                <Button
                  loading={uploadingPhotos}
                  disabled={uploadingPhotos}
                  onClick={handleAddPhotos}
                >
                  ＋ 添加成品照
                </Button>
                {photos.length > 0 ? (
                  <Button
                    onClick={() =>
                      Taro.navigateTo({
                        url: `/pages/meal-share/index?mealPlanId=${mealPlan.id}`,
                      })
                    }
                  >
                    分享本餐
                  </Button>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function today(): string {
  return formatLocalDate(new Date());
}

function nearbyMeal(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  return "dinner";
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return formatLocalDate(value);
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function formatShortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function dateHeading(date: string): string {
  const difference = Math.round(
    (new Date(`${date}T12:00:00`).getTime() -
      new Date(`${today()}T12:00:00`).getTime()) /
      86_400_000,
  );
  return ["今天", "明天", "后天"][difference] ?? formatShortDate(date);
}

function formatTime(dateTime: string): string {
  const date = new Date(dateTime);
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}

function getPhotoAssociation(
  photo: MealPhoto,
  mealPlan: MealPlanDetail,
): string {
  if (!photo.mealItemId) return photo.caption || "整餐合照";
  const dish = mealPlan.items.find((item) => item.id === photo.mealItemId);
  return photo.caption || dish?.recipeName || "成品照";
}

function isUserCancellation(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "errMsg" in error
        ? String(error.errMsg)
        : String(error);

  return message.includes("cancel") || message.includes("取消");
}
