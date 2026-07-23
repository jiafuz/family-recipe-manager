import type { PublicRecipeListItem, RecipeCategory } from "@jiayan/contracts";
import { Button, Input, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useState } from "react";

import { KitchenToolbar } from "../../components/kitchen-toolbar";
import { useCurrentKitchen } from "../../features/kitchens/use-current-kitchen";
import {
  getRecipeCategoryLabel,
  recipeCategories,
} from "../../features/recipes/constants";
import { listPublicRecipes } from "../../services/api-client";

import "./index.scss";

type DiscoverySection = "recipes" | "shares";
type CategoryFilter = "all" | RecipeCategory;

export default function DiscoveryPage(): JSX.Element {
  const kitchen = useCurrentKitchen();
  const [section, setSection] = useState<DiscoverySection>("recipes");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [recipes, setRecipes] = useState<PublicRecipeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (nextCategory = category, nextSearch = search): Promise<void> => {
      setLoading(true);
      setError("");
      try {
        setRecipes(
          await listPublicRecipes({
            ...(nextCategory === "all" ? {} : { category: nextCategory }),
            ...(nextSearch.trim() ? { search: nextSearch.trim() } : {}),
          }),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "暂时无法读取菜谱");
      } finally {
        setLoading(false);
      }
    },
    [category, search],
  );

  useDidShow(() => {
    void load();
  });

  const selectCategory = (nextCategory: CategoryFilter): void => {
    setCategory(nextCategory);
    void load(nextCategory, search);
  };

  return (
    <View className="discovery-page">
      <KitchenToolbar
        kitchenId={kitchen?.id}
        kitchenName={kitchen?.name ?? "我的家"}
        memberCount={kitchen?.memberCount ?? 1}
      />

      <View className="discovery-sections">
        <Button
          className={section === "recipes" ? "is-active" : ""}
          hoverClass="none"
          onClick={() => setSection("recipes")}
        >
          菜谱广场
        </Button>
        <Button
          className={section === "shares" ? "is-active" : ""}
          hoverClass="none"
          onClick={() => setSection("shares")}
        >
          分享广场
        </Button>
      </View>

      {section === "recipes" ? (
        <>
          <View className="discovery-search">
            <Text>⌕</Text>
            <Input
              confirmType="search"
              placeholder="搜索菜名或食材"
              value={search}
              onConfirm={() => void load(category, search)}
              onInput={(event) => setSearch(event.detail.value)}
            />
            <Button
              hoverClass="none"
              onClick={() => void load(category, search)}
            >
              搜索
            </Button>
          </View>

          <ScrollView className="discovery-categories" scrollX>
            <View className="discovery-categories__inner">
              <Button
                className={category === "all" ? "is-active" : ""}
                hoverClass="none"
                onClick={() => selectCategory("all")}
              >
                全部
              </Button>
              {recipeCategories.map((item) => (
                <Button
                  className={category === item.value ? "is-active" : ""}
                  hoverClass="none"
                  key={item.value}
                  onClick={() => selectCategory(item.value)}
                >
                  {item.icon} {item.label}
                </Button>
              ))}
            </View>
          </ScrollView>

          <View className="discovery-banner">
            <View>
              <Text>新家庭快速开始</Text>
              <Text>从一道会做的菜开始，慢慢建立你家的味道。</Text>
            </View>
            <Text>🍚🥢</Text>
          </View>

          <View className="discovery-list-heading">
            <Text>
              {category === "all"
                ? "全部菜谱"
                : getRecipeCategoryLabel(category)}
            </Text>
            <Text>{loading ? "正在更新" : `${recipes.length} 道`}</Text>
          </View>

          {loading ? (
            <View className="discovery-state">正在准备菜谱…</View>
          ) : error ? (
            <View className="discovery-state">
              <Text>{error}</Text>
              <Button hoverClass="none" onClick={() => void load()}>
                重新加载
              </Button>
            </View>
          ) : recipes.length === 0 ? (
            <View className="discovery-state">没有找到符合条件的菜谱</View>
          ) : (
            <View className="discovery-recipe-list">
              {recipes.map((recipe) => (
                <View
                  className="discovery-recipe-item"
                  key={recipe.id}
                  onClick={() =>
                    void Taro.navigateTo({
                      url: `/pages/discovery/recipe-detail/index?recipeId=${encodeURIComponent(recipe.id)}`,
                    })
                  }
                >
                  <Text className="discovery-recipe-item__cover">
                    {recipe.coverEmoji}
                  </Text>
                  <View className="discovery-recipe-item__content">
                    <Text>{recipe.name}</Text>
                    <Text>{recipe.description || "一份值得带回家的菜谱"}</Text>
                    <Text>
                      {getRecipeCategoryLabel(recipe.category)} ·{" "}
                      {recipe.cookMinutes
                        ? `${recipe.cookMinutes} 分钟`
                        : "时间灵活"}{" "}
                      · {recipe.ingredientCount} 种食材
                    </Text>
                  </View>
                  <Text className="discovery-recipe-item__next">›</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <View className="discovery-share-placeholder">
          <Text>🍽️</Text>
          <Text>分享广场正在准备中</Text>
          <Text>
            公开内容审核、举报和隐私保护完成后再开放，不会用假内容代替真实社区。
          </Text>
        </View>
      )}
    </View>
  );
}
