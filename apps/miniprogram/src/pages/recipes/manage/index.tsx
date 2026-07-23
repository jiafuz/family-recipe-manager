import type {
  FamilyRecipeListItem,
  KitchenSummary,
  RecipeCategory,
} from "@jiayan/contracts";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useMemo, useState } from "react";

import {
  getRecipeCategoryLabel,
  recipeCategories,
  recipeOrderingStateLabels,
} from "../../../features/recipes/constants";
import {
  ApiClientError,
  archiveFamilyRecipe,
  ensureSignedIn,
  getStoredCurrentKitchenId,
  listFamilyRecipes,
  updateRecipeOrderingState,
} from "../../../services/api-client";

import "./index.scss";

type CategoryFilter = "all" | RecipeCategory;

export default function RecipeManagePage(): JSX.Element {
  const [kitchen, setKitchen] = useState<KitchenSummary | null>(null);
  const [recipes, setRecipes] = useState<FamilyRecipeListItem[]>([]);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const currentUser = await ensureSignedIn();
      const currentKitchenId = getStoredCurrentKitchenId();
      const selectedKitchen =
        currentUser.kitchens.find((item) => item.id === currentKitchenId) ??
        currentUser.currentKitchen ??
        currentUser.kitchens[0];

      if (!selectedKitchen) {
        await Taro.switchTab({ url: "/pages/ordering/index" });
        return;
      }

      setKitchen(selectedKitchen);
      setRecipes(await listFamilyRecipes(selectedKitchen.id));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadRecipes();
  });

  const visibleRecipes = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("zh-CN");
    return recipes.filter(
      (recipe) =>
        (category === "all" || recipe.category === category) &&
        (!keyword ||
          recipe.name.toLocaleLowerCase("zh-CN").includes(keyword) ||
          recipe.description?.toLocaleLowerCase("zh-CN").includes(keyword)),
    );
  }, [category, recipes, search]);

  const openEditor = (recipeId?: string): void => {
    if (!kitchen) return;
    const query = recipeId ? `&recipeId=${encodeURIComponent(recipeId)}` : "";
    void Taro.navigateTo({
      url: `/pages/recipes/editor/index?kitchenId=${encodeURIComponent(kitchen.id)}${query}`,
    });
  };

  const handleToggleState = async (
    recipe: FamilyRecipeListItem,
  ): Promise<void> => {
    if (!kitchen) return;
    const nextState =
      recipe.orderingState === "available" ? "want_to_learn" : "available";
    try {
      const updated = await updateRecipeOrderingState(
        kitchen.id,
        recipe.id,
        nextState,
      );
      setRecipes((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      await Taro.showToast({
        title: nextState === "available" ? "已开放点菜" : "已暂停点菜",
        icon: "none",
      });
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    }
  };

  const handleDelete = async (recipe: FamilyRecipeListItem): Promise<void> => {
    if (!kitchen) return;
    const confirmation = await Taro.showModal({
      title: `删除“${recipe.name}”？`,
      content: "删除后将不再出现在菜谱管理和点菜页面中。",
      confirmText: "删除",
      confirmColor: "#d54836",
    });
    if (!confirmation.confirm) return;

    try {
      await archiveFamilyRecipe(kitchen.id, recipe.id);
      setRecipes((current) => current.filter((item) => item.id !== recipe.id));
      await Taro.showToast({ title: "已删除", icon: "none" });
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    }
  };

  return (
    <View className="recipe-manage-page">
      <View className="recipe-manage-header">
        <Button className="recipe-manage-header__back" onClick={goBack}>
          ‹
        </Button>
        <Text className="recipe-manage-header__title">菜谱管理</Text>
        <Button
          className="recipe-manage-header__add"
          onClick={() => openEditor()}
        >
          ＋ 添加菜谱
        </Button>
      </View>

      <View className="recipe-manage-search">
        <Text>⌕</Text>
        <Input
          value={search}
          placeholder="搜索菜名或介绍"
          onInput={(event) => setSearch(event.detail.value)}
        />
        {search ? <Button onClick={() => setSearch("")}>清除</Button> : null}
      </View>

      {errorMessage ? (
        <View className="recipe-manage-state">
          <Text>{errorMessage}</Text>
          <Button onClick={loadRecipes}>重新加载</Button>
        </View>
      ) : (
        <View className="recipe-manage-content">
          <View className="recipe-manage-categories">
            <Button
              className={category === "all" ? "is-active" : ""}
              onClick={() => setCategory("all")}
            >
              <Text>☷</Text>全部
              <Text className="recipe-manage-categories__count">
                {recipes.length}
              </Text>
            </Button>
            {recipeCategories.map((item) => (
              <Button
                className={category === item.value ? "is-active" : ""}
                key={item.value}
                onClick={() => setCategory(item.value)}
              >
                <Text>{item.icon}</Text>
                {item.label}
                <Text className="recipe-manage-categories__count">
                  {
                    recipes.filter((recipe) => recipe.category === item.value)
                      .length
                  }
                </Text>
              </Button>
            ))}
          </View>

          <View className="recipe-manage-list">
            {loading ? (
              <Text className="recipe-manage-list__empty">正在加载菜谱…</Text>
            ) : null}
            {!loading && visibleRecipes.length === 0 ? (
              <View className="recipe-manage-list__empty">
                <Text>这里还没有菜谱</Text>
                <Button onClick={() => openEditor()}>添加第一道菜</Button>
              </View>
            ) : null}
            {visibleRecipes.map((recipe) => (
              <View className="managed-recipe" key={recipe.id}>
                <View
                  className="managed-recipe__main"
                  onClick={() => openEditor(recipe.id)}
                >
                  <Text className="managed-recipe__cover">
                    {recipe.coverEmoji}
                  </Text>
                  <View className="managed-recipe__copy">
                    <View className="managed-recipe__title-line">
                      <Text className="managed-recipe__title">
                        {recipe.name}
                      </Text>
                      <Text
                        className={`managed-recipe__state managed-recipe__state--${recipe.orderingState}`}
                      >
                        {recipeOrderingStateLabels[recipe.orderingState]}
                      </Text>
                    </View>
                    <Text className="managed-recipe__description">
                      {recipe.description || "还没有填写菜谱介绍"}
                    </Text>
                    <Text className="managed-recipe__meta">
                      {getRecipeCategoryLabel(recipe.category)} ·{" "}
                      {recipe.cookMinutes
                        ? `${recipe.cookMinutes} 分钟`
                        : "时间未填写"}
                      {" · "}V{recipe.version} · {recipe.ingredientCount} 种用料
                    </Text>
                  </View>
                </View>
                <View className="managed-recipe__actions">
                  <Button onClick={() => openEditor(recipe.id)}>编辑</Button>
                  <Button onClick={() => void handleToggleState(recipe)}>
                    {recipe.orderingState === "available"
                      ? "暂停点菜"
                      : "开放点菜"}
                  </Button>
                  <Button
                    className="is-danger"
                    onClick={() => void handleDelete(recipe)}
                  >
                    删除
                  </Button>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function goBack(): void {
  if (Taro.getCurrentPages().length > 1) {
    void Taro.navigateBack();
  } else {
    void Taro.switchTab({ url: "/pages/ordering/index" });
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}
