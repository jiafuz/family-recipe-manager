import type { PublicRecipeDetail } from "@jiayan/contracts";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useLoad, useRouter } from "@tarojs/taro";
import { useState } from "react";

import { useCurrentKitchen } from "../../../features/kitchens/use-current-kitchen";
import { getRecipeCategoryLabel } from "../../../features/recipes/constants";
import {
  clonePublicRecipe,
  getPublicRecipe,
} from "../../../services/api-client";

import "./index.scss";

export default function PublicRecipeDetailPage(): JSX.Element {
  const recipeId = useRouter().params.recipeId ?? "";
  const kitchen = useCurrentKitchen();
  const [recipe, setRecipe] = useState<PublicRecipeDetail | null>(null);
  const [familyRecipeId, setFamilyRecipeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState("");

  useLoad(() => {
    if (!recipeId) {
      setError("缺少菜谱信息");
      setLoading(false);
      return;
    }
    void getPublicRecipe(recipeId)
      .then(setRecipe)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "暂时无法读取菜谱"),
      )
      .finally(() => setLoading(false));
  });

  const collect = async (): Promise<void> => {
    if (!recipe || collecting) return;
    if (!kitchen) {
      const decision = await Taro.showModal({
        title: "先创建家庭厨房",
        content: "菜谱需要收录到一个家庭厨房，创建后家人才能共同编辑和点菜。",
        confirmText: "去创建",
      });
      if (decision.confirm) {
        await Taro.navigateTo({ url: "/pages/kitchens/create/index" });
      }
      return;
    }

    const choice = await Taro.showActionSheet({
      itemList: ["我家会做，开放点菜", "想学，先保存"],
    }).catch(() => null);
    if (!choice) return;

    setCollecting(true);
    setError("");
    try {
      const result = await clonePublicRecipe(recipe.id, {
        kitchenId: kitchen.id,
        orderingState: choice.tapIndex === 0 ? "available" : "want_to_learn",
      });
      setFamilyRecipeId(result.recipe.id);
      await Taro.showToast({
        title: result.created ? "已收录到我家菜谱" : "这道菜已经收录过了",
        icon: "none",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法收录菜谱");
    } finally {
      setCollecting(false);
    }
  };

  const editFamilyRecipe = async (): Promise<void> => {
    if (!kitchen || !familyRecipeId) return;
    await Taro.navigateTo({
      url: `/pages/recipes/editor/index?kitchenId=${encodeURIComponent(kitchen.id)}&recipeId=${encodeURIComponent(familyRecipeId)}`,
    });
  };

  return (
    <View className="public-recipe-page">
      <View className="public-recipe-header">
        <Button hoverClass="none" onClick={() => void Taro.navigateBack()}>
          ‹
        </Button>
        <Text>菜谱详情</Text>
        <View />
      </View>

      {loading ? (
        <View className="public-recipe-state">正在读取菜谱…</View>
      ) : error && !recipe ? (
        <View className="public-recipe-state">{error}</View>
      ) : recipe ? (
        <>
          <View className="public-recipe-hero">
            <Text>{recipe.coverEmoji}</Text>
            <View>
              <Text>{recipe.name}</Text>
              <Text>{recipe.description}</Text>
              <Text>
                {getRecipeCategoryLabel(recipe.category)} ·{" "}
                {recipe.cookMinutes ? `${recipe.cookMinutes} 分钟` : "时间灵活"}{" "}
                · {recipe.authorName}
              </Text>
            </View>
          </View>

          <View className="public-recipe-section">
            <Text className="public-recipe-section__title">准备食材</Text>
            {recipe.ingredients.map((ingredient) => (
              <View className="public-recipe-ingredient" key={ingredient.id}>
                <Text>{ingredient.name}</Text>
                <Text>
                  {formatQuantity(ingredient.quantity, ingredient.unit)}
                </Text>
              </View>
            ))}
          </View>

          <View className="public-recipe-section">
            <Text className="public-recipe-section__title">制作步骤</Text>
            {recipe.steps.map((step) => (
              <View className="public-recipe-step" key={step.id}>
                <Text>{step.stepNumber}</Text>
                <Text>{step.instruction}</Text>
              </View>
            ))}
          </View>

          {recipe.tips ? (
            <View className="public-recipe-tip">
              <Text>家常小贴士</Text>
              <Text>{recipe.tips}</Text>
            </View>
          ) : null}

          {error ? <Text className="public-recipe-error">{error}</Text> : null}
          <View className="public-recipe-bottom-space" />
          <View className="public-recipe-actions">
            {familyRecipeId ? (
              <Button hoverClass="none" onClick={() => void editFamilyRecipe()}>
                已收录，编辑我家版本
              </Button>
            ) : (
              <Button
                hoverClass="none"
                loading={collecting}
                onClick={() => void collect()}
              >
                收录到我家菜谱
              </Button>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return unit || "适量";
  return `${quantity}${unit || ""}`;
}
