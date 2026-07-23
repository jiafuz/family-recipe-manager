import type {
  KitchenDetail,
  MealPlanDetail,
  MealPhoto,
} from "@jiayan/contracts";
import { Button, Image, Switch, Text, View } from "@tarojs/components";
import Taro, { useLoad, useRouter, useShareAppMessage } from "@tarojs/taro";
import { useState } from "react";

import {
  ApiClientError,
  ensureSignedIn,
  getKitchenDetail,
  getMealPlanById,
  listMealPhotos,
} from "../../services/api-client";

import "./index.scss";

export default function MealSharePage(): JSX.Element {
  const router = useRouter();
  const mealPlanId = router.params.mealPlanId ?? "";
  const [mealPlan, setMealPlan] = useState<MealPlanDetail | null>(null);
  const [kitchen, setKitchen] = useState<KitchenDetail | null>(null);
  const [photos, setPhotos] = useState<MealPhoto[]>([]);
  const [showKitchen, setShowKitchen] = useState(
    router.params.showKitchen === "1",
  );
  const [showUploader, setShowUploader] = useState(
    router.params.showUploader === "1",
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useLoad(() => {
    void load();
  });

  useShareAppMessage(() =>
    Promise.resolve({
      title: mealPlan
        ? `${formatDate(mealPlan.mealDate)} ${mealLabel(mealPlan.mealType)} · ${mealPlan.items.map((item) => item.recipeName).join("、")}`
        : "家宴 · 一起看看这餐饭",
      path: `/pages/meal-share/index?mealPlanId=${mealPlanId}&showKitchen=${showKitchen ? "1" : "0"}&showUploader=${showUploader ? "1" : "0"}`,
      ...(photos[0] ? { imageUrl: photos[0].media.url } : {}),
    }),
  );

  const load = async (): Promise<void> => {
    if (!mealPlanId) {
      setErrorMessage("分享内容不存在");
      setLoading(false);
      return;
    }
    try {
      await ensureSignedIn();
      const [plan, mealPhotos] = await Promise.all([
        getMealPlanById(mealPlanId),
        listMealPhotos(mealPlanId),
      ]);
      setMealPlan(plan);
      setPhotos(mealPhotos);
      setKitchen(await getKitchenDetail(plan.kitchenId));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="meal-share-page">
      <View className="meal-share-header">
        <Button onClick={() => Taro.navigateBack()}>‹ 返回</Button>
        <Text>分享本餐</Text>
        <View />
      </View>
      {loading ? <View className="meal-share-state">正在整理本餐…</View> : null}
      {errorMessage ? (
        <View className="meal-share-state">
          <Text>{errorMessage}</Text>
          <Button onClick={load}>重新加载</Button>
        </View>
      ) : null}
      {!loading && mealPlan && photos.length > 0 ? (
        <>
          <View className="meal-share-preview">
            <Text className="meal-share-preview__eyebrow">
              {formatDate(mealPlan.mealDate)} · {mealLabel(mealPlan.mealType)}
            </Text>
            {showKitchen ? (
              <Text className="meal-share-preview__kitchen">
                {kitchen?.name}
              </Text>
            ) : null}
            <View className="meal-share-photo-grid">
              {photos.map((photo) => (
                <View className="meal-share-photo" key={photo.id}>
                  <Image mode="aspectFill" src={photo.media.url} />
                  <Text>{photoLabel(photo, mealPlan)}</Text>
                  {showUploader ? (
                    <Text className="meal-share-photo__uploader">
                      {photo.uploadedBy.displayName} 上传
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
            <View className="meal-share-menu">
              {mealPlan.items.map((item) => (
                <Text key={item.id}>
                  {item.coverEmoji} {item.recipeName} ×{item.quantity}
                </Text>
              ))}
            </View>
          </View>
          <View className="meal-share-privacy">
            <Text>分享中显示</Text>
            <View>
              <Text>家庭厨房名称</Text>
              <Switch
                checked={showKitchen}
                color="#d54836"
                onChange={(event) => setShowKitchen(event.detail.value)}
              />
            </View>
            <View>
              <Text>照片上传成员</Text>
              <Switch
                checked={showUploader}
                color="#d54836"
                onChange={(event) => setShowUploader(event.detail.value)}
              />
            </View>
            <Text className="meal-share-privacy__tip">
              默认隐藏家庭信息；接收者需要是当前厨房成员。
            </Text>
          </View>
          <View className="meal-share-footer">
            <Button openType="share">发送给微信好友</Button>
          </View>
        </>
      ) : null}
      {!loading && mealPlan && photos.length === 0 ? (
        <View className="meal-share-state">添加成品照后才能分享本餐</View>
      ) : null}
    </View>
  );
}

function photoLabel(photo: MealPhoto, mealPlan: MealPlanDetail): string {
  if (photo.caption) return photo.caption;
  if (!photo.mealItemId) return "整餐合照";
  return (
    mealPlan.items.find((item) => item.id === photo.mealItemId)?.recipeName ??
    "成品照"
  );
}

function formatDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function mealLabel(mealType: MealPlanDetail["mealType"]): string {
  return { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" }[mealType];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "分享内容加载失败";
}
