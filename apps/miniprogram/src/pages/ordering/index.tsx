import type {
  FamilyRecipeListItem,
  KitchenDetail,
  KitchenInviteResponse,
  RecommendationPreferences,
  RecipeCategory,
  TodayRecommendation,
} from "@jiayan/contracts";
import { Button, Input, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useMemo, useState } from "react";

import { FoundationCard } from "../../components/foundation-card";
import { KitchenToolbar } from "../../components/kitchen-toolbar";
import {
  getRecipeCategoryLabel,
  recipeCategories,
} from "../../features/recipes/constants";
import { openAddRecipeMenu } from "../../features/recipes/open-add-recipe-menu";
import {
  clearOrderingDraft,
  clearOrderingEditContext,
  loadOrderingDraft,
  loadOrderingEditContext,
  type OrderingDraftItem,
  type OrderingEditContext,
  saveOrderingDraft,
} from "../../features/ordering/draft";
import {
  ApiClientError,
  createKitchen,
  createKitchenInvite,
  ensureSignedIn,
  getKitchenDetail,
  getStoredCurrentKitchenId,
  getTodayRecommendation,
  joinKitchen,
  listFamilyRecipes,
  clonePublicRecipe,
  refreshTodayRecommendation,
  updateRecommendationPreferences,
} from "../../services/api-client";

import "./index.scss";

type PagePhase = "loading" | "onboarding" | "ready" | "error";
type OnboardingMode = "choice" | "create" | "join";
type CategoryFilter = "all" | RecipeCategory;

const strategyOptions = [
  { value: "long_time_no_eat", label: "好久没吃" },
  { value: "balanced", label: "均衡搭配" },
  { value: "light", label: "轻盈少负担" },
  { value: "spicy", label: "香辣过瘾" },
  { value: "quick", label: "快手不费事" },
] as const;

const sourceOptions = [
  { value: "family_only", label: "只从我家菜谱" },
  { value: "mixed", label: "我家＋菜谱广场" },
  { value: "public_only", label: "只从菜谱广场" },
] as const;

export default function OrderingPage(): JSX.Element {
  const [phase, setPhase] = useState<PagePhase>("loading");
  const [mode, setMode] = useState<OnboardingMode>("choice");
  const [kitchen, setKitchen] = useState<KitchenDetail | null>(null);
  const [recipes, setRecipes] = useState<FamilyRecipeListItem[]>([]);
  const [recommendation, setRecommendation] =
    useState<TodayRecommendation | null>(null);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [selectedItems, setSelectedItems] = useState<OrderingDraftItem[]>([]);
  const [editContext, setEditContext] = useState<OrderingEditContext | null>(
    null,
  );
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeCategory, setRecipeCategory] = useState<CategoryFilter>("all");
  const [kitchenName, setKitchenName] = useState("我的厨房");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [activeInvite, setActiveInvite] =
    useState<KitchenInviteResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const bootstrap = useCallback(async () => {
    setPhase("loading");
    setErrorMessage("");

    try {
      const currentUser = await ensureSignedIn();

      if (currentUser.kitchens.length === 0) {
        setPhase("onboarding");
        return;
      }

      const storedKitchenId = getStoredCurrentKitchenId();
      const selectedKitchen =
        currentUser.kitchens.find((item) => item.id === storedKitchenId) ??
        currentUser.currentKitchen ??
        currentUser.kitchens[0];

      if (!selectedKitchen) {
        setPhase("onboarding");
        return;
      }

      const [kitchenDetail, availableRecipes, todayRecommendation] =
        await Promise.all([
          getKitchenDetail(selectedKitchen.id),
          listFamilyRecipes(selectedKitchen.id, { orderingState: "available" }),
          getTodayRecommendation(selectedKitchen.id).catch(() => null),
        ]);
      setKitchen(kitchenDetail);
      setRecipes(availableRecipes);
      setRecommendation(todayRecommendation);
      const draft = loadOrderingDraft();
      const storedEditContext = loadOrderingEditContext();
      setSelectedItems(
        draft?.kitchenId === kitchenDetail.id ? draft.items : [],
      );
      setEditContext(
        storedEditContext?.kitchenId === kitchenDetail.id
          ? storedEditContext
          : null,
      );
      setPhase("ready");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setPhase("error");
    }
  }, []);

  useDidShow(() => {
    void bootstrap();
  });

  const handleCreateKitchen = async (): Promise<void> => {
    if (!kitchenName.trim()) {
      setErrorMessage("请输入厨房名称");
      return;
    }

    await runOnboardingAction(() =>
      createKitchen({ name: kitchenName.trim(), icon: "🏠" }),
    );
  };

  const handleJoinKitchen = async (): Promise<void> => {
    if (!/^\d{6}$/.test(inviteCode)) {
      setErrorMessage("请输入 6 位邀请码");
      return;
    }

    await runOnboardingAction(() => joinKitchen({ inviteCode }));
  };

  const runOnboardingAction = async (
    action: () => Promise<KitchenDetail>,
  ): Promise<void> => {
    setSubmitting(true);
    setErrorMessage("");

    try {
      const kitchenDetail = await action();
      setKitchen(kitchenDetail);
      setRecipes(
        await listFamilyRecipes(kitchenDetail.id, {
          orderingState: "available",
        }),
      );
      setRecommendation(
        await getTodayRecommendation(kitchenDetail.id).catch(() => null),
      );
      setSelectedItems([]);
      clearOrderingEditContext();
      setEditContext(null);
      setPhase("ready");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInvite = async (): Promise<void> => {
    if (!kitchen) return;

    setCreatingInvite(true);
    setErrorMessage("");

    try {
      setActiveInvite(await createKitchenInvite(kitchen.id));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopyInvite = async (): Promise<void> => {
    if (!activeInvite) return;
    await Taro.setClipboardData({ data: activeInvite.code });
  };

  const visibleRecipes = useMemo(() => {
    const keyword = recipeSearch.trim().toLocaleLowerCase("zh-CN");
    return recipes.filter(
      (recipe) =>
        (recipeCategory === "all" || recipe.category === recipeCategory) &&
        (!keyword ||
          recipe.name.toLocaleLowerCase("zh-CN").includes(keyword) ||
          recipe.description?.toLocaleLowerCase("zh-CN").includes(keyword)),
    );
  }, [recipeCategory, recipeSearch, recipes]);

  const saveRecommendationPreferences = async (
    preferences: RecommendationPreferences,
  ): Promise<void> => {
    if (!kitchen) return;
    setRecommendationBusy(true);
    try {
      setRecommendation(
        await updateRecommendationPreferences(kitchen.id, preferences),
      );
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setRecommendationBusy(false);
    }
  };

  const toggleRecommendation = (): void => {
    if (!recommendation) return;
    void saveRecommendationPreferences({
      ...recommendation.preferences,
      collapsed: !recommendation.preferences.collapsed,
    });
  };

  const refreshRecommendation = async (): Promise<void> => {
    if (!kitchen || !recommendation) return;
    setRecommendationBusy(true);
    try {
      const next = await refreshTodayRecommendation(
        kitchen.id,
        recommendation.items.map((item) => item.id),
      );
      const unchanged =
        next.items.map((item) => item.id).join(",") ===
        recommendation.items.map((item) => item.id).join(",");
      setRecommendation(next);
      if (unchanged) {
        await Taro.showToast({ title: "当前范围暂无更多菜谱", icon: "none" });
      }
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setRecommendationBusy(false);
    }
  };

  const adjustRecommendation = async (): Promise<void> => {
    if (!recommendation) return;
    const strategyIndex = await chooseAction(
      strategyOptions.map((item) => item.label),
    );
    if (strategyIndex === null) return;
    const sourceIndex = await chooseAction(
      sourceOptions.map((item) => item.label),
    );
    if (sourceIndex === null) return;
    const countIndex = await chooseAction(["3 道", "4 道", "5 道", "6 道"]);
    if (countIndex === null) return;
    const strategy = strategyOptions[strategyIndex];
    const source = sourceOptions[sourceIndex];
    if (!strategy || !source) return;
    await saveRecommendationPreferences({
      strategy: strategy.value,
      sourceScope: source.value,
      itemCount: countIndex + 3,
      collapsed: recommendation.preferences.collapsed,
    });
  };

  const useRecommendation = async (): Promise<void> => {
    if (!kitchen || !recommendation || recommendation.items.length === 0)
      return;
    setRecommendationBusy(true);
    try {
      const items: OrderingDraftItem[] = [];
      const newlyCloned: FamilyRecipeListItem[] = [];
      for (const recommendationItem of recommendation.items) {
        if (recommendationItem.source === "public") {
          const result = await clonePublicRecipe(recommendationItem.id, {
            kitchenId: kitchen.id,
            orderingState: "available",
          });
          newlyCloned.push(result.recipe);
          items.push({
            recipeId: result.recipe.id,
            recipeVersionId: result.recipe.currentVersionId,
            name: result.recipe.name,
            coverEmoji: result.recipe.coverEmoji,
            quantity: 1,
            tasteNote: null,
          });
        } else {
          items.push({
            recipeId: recommendationItem.id,
            recipeVersionId: recommendationItem.currentVersionId,
            name: recommendationItem.name,
            coverEmoji: recommendationItem.coverEmoji,
            quantity: 1,
            tasteNote: null,
          });
        }
      }

      setRecipes((current) => {
        const existing = new Set(current.map((recipe) => recipe.id));
        return [
          ...current,
          ...newlyCloned.filter((recipe) => !existing.has(recipe.id)),
        ];
      });
      setSelectedItems((current) => {
        const existing = new Set(current.map((item) => item.recipeId));
        const next = [
          ...current,
          ...items.filter((item) => !existing.has(item.recipeId)),
        ];
        saveOrderingDraft({ kitchenId: kitchen.id, items: next });
        return next;
      });
      await Taro.showToast({
        title: `已选用 ${items.length} 道推荐`,
        icon: "success",
      });
    } catch (error) {
      await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
    } finally {
      setRecommendationBusy(false);
    }
  };

  const openRecipeCreator = (): void => {
    if (!kitchen) return;
    void openAddRecipeMenu(kitchen.id);
  };

  const toggleRecipe = (recipe: FamilyRecipeListItem): void => {
    if (!kitchen) return;
    setSelectedItems((current) => {
      const exists = current.some((item) => item.recipeId === recipe.id);
      const next = exists
        ? current.filter((item) => item.recipeId !== recipe.id)
        : [
            ...current,
            {
              recipeId: recipe.id,
              recipeVersionId: recipe.currentVersionId,
              name: recipe.name,
              coverEmoji: recipe.coverEmoji,
              quantity: 1,
              tasteNote: null,
            },
          ];
      if (next.length > 0) {
        saveOrderingDraft({ kitchenId: kitchen.id, items: next });
      } else {
        clearOrderingDraft();
      }
      return next;
    });
  };

  const openCheckout = (): void => {
    if (!kitchen || selectedItems.length === 0) return;
    saveOrderingDraft({ kitchenId: kitchen.id, items: selectedItems });
    void Taro.navigateTo({ url: "/pages/ordering/checkout/index" });
  };

  const exitMealEdit = (): void => {
    clearOrderingDraft();
    clearOrderingEditContext();
    setSelectedItems([]);
    setEditContext(null);
  };

  if (phase === "loading") {
    return (
      <View className="ordering-page ordering-page--centered">
        <Text className="ordering-loading__mark">家</Text>
        <Text className="ordering-loading__text">正在进入家庭厨房…</Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View className="ordering-page ordering-page--centered">
        <Text className="ordering-state__title">暂时没能进入厨房</Text>
        <Text className="ordering-state__description">{errorMessage}</Text>
        <Button
          className="ordering-button ordering-button--primary"
          onClick={bootstrap}
        >
          重新连接
        </Button>
      </View>
    );
  }

  if (phase === "onboarding") {
    return (
      <View className="ordering-page ordering-onboarding">
        <View className="ordering-onboarding__brand">
          <Text className="ordering-loading__mark">家</Text>
          <Text className="ordering-onboarding__title">先加入一间家庭厨房</Text>
          <Text className="ordering-onboarding__description">
            一家人的菜谱、点餐记录和采购清单都会保存在这里
          </Text>
        </View>

        {mode === "choice" ? (
          <View className="ordering-onboarding__actions">
            <Button
              className="ordering-button ordering-button--primary"
              onClick={() => setMode("create")}
            >
              创建我的厨房
            </Button>
            <Button
              className="ordering-button ordering-button--secondary"
              onClick={() => setMode("join")}
            >
              使用邀请码加入
            </Button>
          </View>
        ) : null}

        {mode === "create" ? (
          <View className="ordering-form">
            <Text className="ordering-form__label">厨房名称</Text>
            <Input
              className="ordering-form__input"
              maxlength={20}
              value={kitchenName}
              placeholder="例如：小满家的厨房"
              onInput={(event) => setKitchenName(event.detail.value)}
            />
            {errorMessage ? (
              <Text className="ordering-form__error">{errorMessage}</Text>
            ) : null}
            <Button
              className="ordering-button ordering-button--primary"
              loading={submitting}
              disabled={submitting}
              onClick={handleCreateKitchen}
            >
              创建并进入
            </Button>
            <Button
              className="ordering-button ordering-button--text"
              onClick={() => setMode("choice")}
            >
              返回
            </Button>
          </View>
        ) : null}

        {mode === "join" ? (
          <View className="ordering-form">
            <Text className="ordering-form__label">6 位邀请码</Text>
            <Input
              className="ordering-form__input ordering-form__input--code"
              type="number"
              maxlength={6}
              value={inviteCode}
              placeholder="请输入邀请码"
              onInput={(event) => setInviteCode(event.detail.value.slice(0, 6))}
            />
            {errorMessage ? (
              <Text className="ordering-form__error">{errorMessage}</Text>
            ) : null}
            <Button
              className="ordering-button ordering-button--primary"
              loading={submitting}
              disabled={submitting}
              onClick={handleJoinKitchen}
            >
              加入厨房
            </Button>
            <Button
              className="ordering-button ordering-button--text"
              onClick={() => setMode("choice")}
            >
              返回
            </Button>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View className="ordering-page">
      <KitchenToolbar
        kitchenId={kitchen!.id}
        kitchenName={kitchen!.name}
        memberCount={kitchen!.memberCount}
      />
      {editContext ? (
        <View className="ordering-edit-context">
          <View>
            <Text>正在编辑 {formatEditDate(editContext.date)}</Text>
            <Text>{getMealLabel(editContext.mealType)} · 选好后直接提交</Text>
          </View>
          <Button onClick={exitMealEdit}>退出编辑</Button>
        </View>
      ) : null}
      <View className="ordering-recipe-search">
        <Text>⌕</Text>
        <Input
          value={recipeSearch}
          placeholder="搜索我家会做的菜"
          onInput={(event) => setRecipeSearch(event.detail.value)}
        />
      </View>
      {recommendation ? (
        recommendation.preferences.collapsed ? (
          <View className="ordering-recommendation ordering-recommendation--collapsed">
            <View className="ordering-recommendation__compact-copy">
              <Text>✨ 今日推荐</Text>
              <Text>
                {strategyLabel(recommendation.preferences.strategy)} ·{" "}
                {recommendation.items.length} 道
              </Text>
            </View>
            <Button
              disabled={recommendationBusy}
              onClick={toggleRecommendation}
            >
              展开
            </Button>
          </View>
        ) : (
          <View className="ordering-recommendation">
            <View className="ordering-recommendation__header">
              <View>
                <Text className="ordering-recommendation__title">
                  ✨ 今日推荐
                </Text>
                <Text className="ordering-recommendation__summary">
                  {strategyLabel(recommendation.preferences.strategy)} ·{" "}
                  {sourceLabel(recommendation.preferences.sourceScope)}
                </Text>
              </View>
              <Button
                disabled={recommendationBusy}
                onClick={toggleRecommendation}
              >
                收起
              </Button>
            </View>
            {recommendation.items.length > 0 ? (
              <ScrollView
                className="ordering-recommendation__list"
                scrollX
                enhanced
                showScrollbar={false}
              >
                <View className="ordering-recommendation__track">
                  {recommendation.items.map((item) => (
                    <View
                      className="ordering-recommendation-item"
                      key={item.id}
                    >
                      <View className="ordering-recommendation-item__cover">
                        <Text>{item.coverEmoji}</Text>
                        {item.source === "public" ? <Text>广场</Text> : null}
                      </View>
                      <Text className="ordering-recommendation-item__name">
                        {item.name}
                      </Text>
                      <Text className="ordering-recommendation-item__reason">
                        {item.reason}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View className="ordering-recommendation__empty">
                <Text>我家还没有可推荐的菜谱</Text>
                <Text>可以调整来源，或先添加几道家庭菜谱。</Text>
              </View>
            )}
            {recommendation.shortageMessage ? (
              <Text className="ordering-recommendation__shortage">
                {recommendation.shortageMessage}
              </Text>
            ) : null}
            <View className="ordering-recommendation__actions">
              <Button
                loading={recommendationBusy}
                disabled={recommendationBusy}
                onClick={refreshRecommendation}
              >
                换一组
              </Button>
              <Button
                disabled={recommendationBusy}
                onClick={adjustRecommendation}
              >
                调整推荐偏好
              </Button>
              <Button
                className="is-primary"
                disabled={
                  recommendationBusy || recommendation.items.length === 0
                }
                onClick={useRecommendation}
              >
                选用推荐
              </Button>
            </View>
          </View>
        )
      ) : null}
      <View className="ordering-recipe-heading">
        <Text>今天想吃什么？</Text>
        <View>
          <Button
            onClick={() =>
              Taro.navigateTo({ url: "/pages/recipes/manage/index" })
            }
          >
            ☷ 菜谱管理
          </Button>
          <Button onClick={openRecipeCreator}>＋ 添加菜谱</Button>
        </View>
      </View>
      <View className="ordering-recipe-layout">
        <View className="ordering-recipe-categories">
          <Button
            className={recipeCategory === "all" ? "is-active" : ""}
            onClick={() => setRecipeCategory("all")}
          >
            <Text>🔥</Text>推荐
            <Text>{recipes.length}</Text>
          </Button>
          {recipeCategories.map((item) => (
            <Button
              className={recipeCategory === item.value ? "is-active" : ""}
              key={item.value}
              onClick={() => setRecipeCategory(item.value)}
            >
              <Text>{item.icon}</Text>
              {item.label}
              <Text>
                {
                  recipes.filter((recipe) => recipe.category === item.value)
                    .length
                }
              </Text>
            </Button>
          ))}
        </View>
        <View className="ordering-recipe-list">
          {visibleRecipes.length === 0 ? (
            <View className="ordering-recipe-empty">
              <Text>
                {recipes.length === 0
                  ? "还没有开放点菜的家庭菜谱"
                  : "这个分类暂时没有菜"}
              </Text>
              {recipes.length === 0 ? (
                <Button onClick={openRecipeCreator}>添加第一道菜</Button>
              ) : null}
            </View>
          ) : null}
          {visibleRecipes.map((recipe) => (
            <View className="ordering-recipe-item" key={recipe.id}>
              <Text className="ordering-recipe-item__cover">
                {recipe.coverEmoji}
              </Text>
              <View className="ordering-recipe-item__copy">
                <Text className="ordering-recipe-item__name">
                  {recipe.name}
                </Text>
                {isFirstIntroduced(recipe.firstIntroducedUntil) ? (
                  <Text className="ordering-recipe-item__introduced">
                    首次引入我家菜谱
                  </Text>
                ) : null}
                <Text className="ordering-recipe-item__description">
                  {recipe.description || "我家的做法"}
                </Text>
                <Text className="ordering-recipe-item__meta">
                  {getRecipeCategoryLabel(recipe.category)} ·{" "}
                  {recipe.cookMinutes
                    ? `${recipe.cookMinutes} 分钟`
                    : `${recipe.ingredientCount} 种用料`}
                  {" · "}V{recipe.version}
                </Text>
              </View>
              <Button
                className={`ordering-recipe-item__add ${
                  selectedItems.some((item) => item.recipeId === recipe.id)
                    ? "is-selected"
                    : ""
                }`}
                onClick={() => toggleRecipe(recipe)}
              >
                {selectedItems.some((item) => item.recipeId === recipe.id)
                  ? "✓"
                  : "＋"}
              </Button>
            </View>
          ))}
        </View>
      </View>
      <FoundationCard
        title="家庭成员"
        description="邀请家人加入后，大家会看到同一份家庭菜谱。"
      >
        <View className="ordering-members">
          {kitchen?.members.map((member) => (
            <View className="ordering-member" key={member.userId}>
              <Text className="ordering-member__avatar">
                {member.role === "owner" ? "👩‍🍳" : "🙂"}
              </Text>
              <Text className="ordering-member__name">
                {member.nickname || member.displayName}
              </Text>
              <Text className="ordering-member__role">
                {member.role === "owner" ? "创建者" : "家庭成员"}
              </Text>
            </View>
          ))}
        </View>
        <View className="ordering-invite">
          {activeInvite ? (
            <View className="ordering-invite__result">
              <View>
                <Text className="ordering-invite__label">家庭邀请码</Text>
                <Text className="ordering-invite__code">
                  {activeInvite.code}
                </Text>
              </View>
              <Button
                className="ordering-invite__copy"
                onClick={handleCopyInvite}
              >
                复制
              </Button>
            </View>
          ) : (
            <Button
              className="ordering-invite__create"
              loading={creatingInvite}
              disabled={creatingInvite}
              onClick={handleCreateInvite}
            >
              ＋ 邀请家庭成员
            </Button>
          )}
          {errorMessage ? (
            <Text className="ordering-form__error">{errorMessage}</Text>
          ) : null}
        </View>
      </FoundationCard>
      {selectedItems.length > 0 ? (
        <View className="ordering-cart-bar">
          <View>
            <Text>{selectedItems.length}</Text>
            <Text>已选 {selectedItems.length} 道菜</Text>
          </View>
          <Button onClick={openCheckout}>选好了</Button>
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

function formatEditDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function getMealLabel(mealType: OrderingEditContext["mealType"]): string {
  return {
    breakfast: "早餐",
    lunch: "午餐",
    dinner: "晚餐",
  }[mealType];
}

async function chooseAction(itemList: string[]): Promise<number | null> {
  const result = await Taro.showActionSheet({ itemList }).catch(() => null);
  return result?.tapIndex ?? null;
}

function strategyLabel(
  strategy: RecommendationPreferences["strategy"],
): string {
  return (
    strategyOptions.find((option) => option.value === strategy)?.label ??
    "好久没吃"
  );
}

function sourceLabel(
  sourceScope: RecommendationPreferences["sourceScope"],
): string {
  return (
    sourceOptions.find((option) => option.value === sourceScope)?.label ??
    "只从我家菜谱"
  );
}

function isFirstIntroduced(value: string | null): boolean {
  return Boolean(value && Date.parse(value) > Date.now());
}
