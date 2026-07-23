import type { MealPlanDetail, MealPhoto } from "@jiayan/contracts";
import {
  Button,
  Image,
  Picker,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro, { useLoad, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";

import {
  ApiClientError,
  deleteMealPhoto,
  getMealPlanById,
  listMealPhotos,
  updateMealPhoto,
} from "../../services/api-client";
import { uploadMealPhoto } from "../../services/media-upload";

import "./index.scss";

export default function MealPhotoEditorPage(): JSX.Element {
  const router = useRouter();
  const mealPlanId = router.params.mealPlanId ?? "";
  const photoId = router.params.photoId ?? "";
  const [mealPlan, setMealPlan] = useState<MealPlanDetail | null>(null);
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
  const [caption, setCaption] = useState("");
  const [mealItemId, setMealItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useLoad(() => {
    void load();
  });

  const associationOptions = useMemo(
    () => [
      { value: null, label: "整餐合照" },
      ...(mealPlan?.items.map((item) => ({
        value: item.id,
        label: item.recipeName,
      })) ?? []),
    ],
    [mealPlan],
  );
  const associationIndex = Math.max(
    0,
    associationOptions.findIndex((item) => item.value === mealItemId),
  );

  async function load(): Promise<void> {
    if (!mealPlanId || !photoId) {
      setErrorMessage("照片信息不完整");
      return;
    }
    try {
      const [plan, photos] = await Promise.all([
        getMealPlanById(mealPlanId),
        listMealPhotos(mealPlanId),
      ]);
      const current = photos.find((item) => item.id === photoId);
      if (!current) {
        setErrorMessage("这张照片已经不存在");
        return;
      }
      setMealPlan(plan);
      setPhoto(current);
      setCaption(current.caption ?? "");
      setMealItemId(current.mealItemId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  const save = async (): Promise<void> => {
    if (!photo) return;
    setSaving(true);
    try {
      setPhoto(
        await updateMealPhoto(photo.id, {
          caption: caption.trim() || null,
          mealItemId,
        }),
      );
      await Taro.showToast({ title: "照片信息已保存", icon: "success" });
      setTimeout(() => void Taro.navigateBack(), 400);
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  const replacePhoto = async (): Promise<void> => {
    if (!photo || !mealPlan) return;
    try {
      const selection = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const file = selection.tempFiles[0];
      if (!file) return;
      setSaving(true);
      const mediaAssetId = await uploadMealPhoto(mealPlan.kitchenId, {
        tempFilePath: file.tempFilePath,
        size: file.size,
      });
      setPhoto(await updateMealPhoto(photo.id, { mediaAssetId }));
      await Taro.showToast({ title: "图片已替换", icon: "success" });
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async (): Promise<void> => {
    if (!photo) return;
    const confirmation = await Taro.showModal({
      title: "删除这张照片？",
      content: "删除后，分享内容和制作回忆中也将不再显示。",
      confirmText: "删除",
      confirmColor: "#d54836",
    });
    if (!confirmation.confirm) return;
    await deleteMealPhoto(photo.id);
    await Taro.showToast({ title: "照片已删除", icon: "success" });
    setTimeout(() => void Taro.navigateBack(), 300);
  };

  return (
    <View className="photo-editor-page">
      <View className="photo-editor-header">
        <Button onClick={() => Taro.navigateBack()}>‹ 返回</Button>
        <Text>编辑成品照</Text>
        <View />
      </View>
      {errorMessage ? (
        <View className="photo-editor-state">{errorMessage}</View>
      ) : null}
      {photo && mealPlan ? (
        <View className="photo-editor-content">
          <View className="photo-editor-preview">
            <Image mode="aspectFill" src={photo.media.url} />
            <Button disabled={saving} onClick={replacePhoto}>
              替换图片
            </Button>
          </View>
          <View className="photo-editor-form">
            <Text>关联到</Text>
            <Picker
              mode="selector"
              range={associationOptions.map((item) => item.label)}
              value={associationIndex}
              onChange={(event) =>
                setMealItemId(
                  associationOptions[Number(event.detail.value)]?.value ?? null,
                )
              }
            >
              <View className="photo-editor-picker">
                {associationOptions[associationIndex]?.label} ›
              </View>
            </Picker>
            <Text>照片说明（选填）</Text>
            <Textarea
              maxlength={500}
              value={caption}
              placeholder="记录这道菜或这一餐"
              onInput={(event) => setCaption(event.detail.value)}
            />
          </View>
          <Button
            className="photo-editor-delete"
            disabled={saving}
            onClick={removePhoto}
          >
            删除图片
          </Button>
        </View>
      ) : null}
      {photo ? (
        <View className="photo-editor-footer">
          <Button loading={saving} disabled={saving} onClick={save}>
            保存修改
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}
