import type {
  RecipeCategory,
  RecipeOrderingState,
  SaveFamilyRecipeInput,
} from "@jiayan/contracts";
import {
  Button,
  Input,
  Picker,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  recipeCategories,
  recipeOrderingStateLabels,
} from "../../../features/recipes/constants";
import {
  ApiClientError,
  completeRecipeImport,
  createFamilyRecipe,
  getFamilyRecipe,
  getRecipeImport,
  updateFamilyRecipe,
} from "../../../services/api-client";

import "./index.scss";

interface IngredientDraft {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
}

interface StepDraft {
  key: string;
  instruction: string;
}

const coverOptions = ["🍲", "🥘", "🍳", "🥬", "🐟", "🍤", "🍚", "🥣"];
const ingredientCategories = [
  { value: "vegetable", label: "蔬菜" },
  { value: "meat", label: "肉禽" },
  { value: "fish", label: "水产" },
  { value: "egg", label: "蛋奶" },
  { value: "staple", label: "主食" },
  { value: "seasoning", label: "调味" },
  { value: "other", label: "其它" },
];
let draftKey = 0;

function nextKey(prefix: string): string {
  draftKey += 1;
  return `${prefix}-${draftKey}`;
}

function emptyIngredient(): IngredientDraft {
  return {
    key: nextKey("ingredient"),
    name: "",
    quantity: "",
    unit: "",
    category: "other",
  };
}

function emptyStep(): StepDraft {
  return { key: nextKey("step"), instruction: "" };
}

export default function RecipeEditorPage(): JSX.Element {
  const router = useRouter();
  const kitchenId = router.params.kitchenId ?? "";
  const recipeId = router.params.recipeId ?? "";
  const importId = router.params.importId ?? "";
  const editing = Boolean(recipeId);

  const [loading, setLoading] = useState(editing || Boolean(importId));
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RecipeCategory>("vegetable");
  const [coverEmoji, setCoverEmoji] = useState("🍲");
  const [cookMinutes, setCookMinutes] = useState("");
  const [tips, setTips] = useState("");
  const [orderingState, setOrderingState] =
    useState<RecipeOrderingState>("available");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([
    emptyIngredient(),
  ]);
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!kitchenId) {
      void Taro.showToast({ title: "缺少厨房信息", icon: "none" });
      return;
    }
    if (recipeId) {
      void getFamilyRecipe(kitchenId, recipeId)
        .then((recipe) => {
          setVersion(recipe.version);
          setName(recipe.name);
          setDescription(recipe.description ?? "");
          setCategory(recipe.category);
          setCoverEmoji(recipe.coverEmoji);
          setCookMinutes(recipe.cookMinutes?.toString() ?? "");
          setTips(recipe.tips ?? "");
          setOrderingState(recipe.orderingState);
          setIngredients(
            recipe.ingredients.map((ingredient) => ({
              key: ingredient.id,
              name: ingredient.name,
              quantity: ingredient.quantity?.toString() ?? "",
              unit: ingredient.unit ?? "",
              category: ingredient.category,
            })),
          );
          setSteps(
            recipe.steps.map((step) => ({
              key: step.id,
              instruction: step.instruction,
            })),
          );
        })
        .catch((error) => {
          void showLoadError("无法打开菜谱", error);
        })
        .finally(() => setLoading(false));
      return;
    }

    if (!importId) return;
    void getRecipeImport(kitchenId, importId)
      .then((recipeImport) => {
        const { draft } = recipeImport;
        setName(draft.name);
        setDescription(draft.description ?? "");
        setCategory(draft.category);
        setCoverEmoji(draft.coverEmoji);
        setCookMinutes(draft.cookMinutes?.toString() ?? "");
        setTips(draft.tips ?? "");
        setIngredients(
          draft.ingredients.length > 0
            ? draft.ingredients.map((ingredient) => ({
                key: nextKey("imported-ingredient"),
                name: ingredient.name,
                quantity: ingredient.quantity?.toString() ?? "",
                unit: ingredient.unit ?? "",
                category: ingredient.category,
              }))
            : [emptyIngredient()],
        );
        setSteps(
          draft.steps.length > 0
            ? draft.steps.map((step) => ({
                key: nextKey("imported-step"),
                instruction: step.instruction,
              }))
            : [emptyStep()],
        );
        setImportWarnings(recipeImport.warnings);
      })
      .catch((error) => {
        void showLoadError("无法打开导入草稿", error);
      })
      .finally(() => setLoading(false));
  }, [importId, kitchenId, recipeId]);

  const showLoadError = async (
    title: string,
    error: unknown,
  ): Promise<void> => {
    await Taro.showModal({
      title,
      content: getErrorMessage(error),
      showCancel: false,
    });
    await Taro.navigateBack();
  };

  const updateIngredient = (
    key: string,
    field: "name" | "quantity" | "unit" | "category",
    value: string,
  ): void => {
    setIngredients((current) =>
      current.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  };

  const removeIngredient = (key: string): void => {
    if (ingredients.length === 1) {
      void Taro.showToast({ title: "至少保留一种食材", icon: "none" });
      return;
    }
    setIngredients((current) => current.filter((item) => item.key !== key));
  };

  const updateStep = (key: string, instruction: string): void => {
    setSteps((current) =>
      current.map((item) =>
        item.key === key ? { ...item, instruction } : item,
      ),
    );
  };

  const removeStep = (key: string): void => {
    if (steps.length === 1) {
      void Taro.showToast({ title: "至少保留一个步骤", icon: "none" });
      return;
    }
    setSteps((current) => current.filter((item) => item.key !== key));
  };

  const handleSave = async (): Promise<void> => {
    if (!kitchenId) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      await Taro.showToast({ title: "请填写菜谱名称", icon: "none" });
      return;
    }
    if (ingredients.some((item) => !item.name.trim())) {
      await Taro.showToast({ title: "请补全食材名称", icon: "none" });
      return;
    }
    if (steps.some((item) => !item.instruction.trim())) {
      await Taro.showToast({ title: "请补全做法步骤", icon: "none" });
      return;
    }
    if (
      ingredients.some(
        (item) =>
          item.quantity.trim() && !Number.isFinite(Number(item.quantity)),
      )
    ) {
      await Taro.showToast({ title: "食材用量请填写数字", icon: "none" });
      return;
    }

    const data: SaveFamilyRecipeInput = {
      name: trimmedName,
      description: description.trim() || null,
      category,
      coverEmoji,
      cookMinutes: cookMinutes.trim() ? Number(cookMinutes) : null,
      tips: tips.trim() || null,
      orderingState,
      ingredients: ingredients.map((ingredient) => ({
        name: ingredient.name.trim(),
        quantity: ingredient.quantity.trim()
          ? Number(ingredient.quantity)
          : null,
        unit: ingredient.unit.trim() || null,
        category: ingredient.category,
      })),
      steps: steps.map((step) => ({
        instruction: step.instruction.trim(),
      })),
    };

    setSaving(true);
    try {
      if (editing) {
        await updateFamilyRecipe(kitchenId, recipeId, {
          ...data,
          expectedVersion: version,
          changeNote: "家庭成员编辑菜谱",
        });
      } else {
        const created = await createFamilyRecipe(kitchenId, data);
        if (importId) {
          try {
            await completeRecipeImport(importId, {
              kitchenId,
              recipeId: created.id,
            });
          } catch {
            await Taro.showToast({
              title: "菜谱已保存，导入记录稍后同步",
              icon: "none",
            });
          }
        }
      }
      await Taro.showToast({ title: "菜谱已保存", icon: "success" });
      setTimeout(() => void Taro.navigateBack(), 500);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "RECIPE_VERSION_CONFLICT"
      ) {
        await Taro.showModal({
          title: "菜谱已有新版本",
          content: "另一位家庭成员刚刚更新了这道菜，请返回列表后重新打开。",
          showCancel: false,
        });
      } else {
        await Taro.showToast({ title: getErrorMessage(error), icon: "none" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="recipe-editor-loading">
        <Text>正在打开家庭菜谱…</Text>
      </View>
    );
  }

  return (
    <View className="recipe-editor-page">
      <View className="recipe-editor-header">
        <Button onClick={() => Taro.navigateBack()}>‹</Button>
        <View>
          <Text className="recipe-editor-header__title">
            {editing ? "编辑菜谱" : importId ? "核对导入草稿" : "创建菜谱"}
          </Text>
          {editing ? (
            <Text className="recipe-editor-header__version">
              家庭版本 V{version}
            </Text>
          ) : null}
        </View>
        <Text />
      </View>

      {importId ? (
        <View className="recipe-editor-import-notice">
          <Text>导入内容需要你确认</Text>
          <Text>请特别核对用量、火候和步骤，确认无误后再保存。</Text>
          {importWarnings.map((warning) => (
            <Text key={warning}>· {warning}</Text>
          ))}
        </View>
      ) : null}

      <View className="recipe-editor-section recipe-editor-cover-section">
        <Text className="recipe-editor-label">选择封面标识</Text>
        <View className="recipe-editor-cover-options">
          {coverOptions.map((emoji) => (
            <Button
              className={coverEmoji === emoji ? "is-active" : ""}
              key={emoji}
              onClick={() => setCoverEmoji(emoji)}
            >
              {emoji}
            </Button>
          ))}
        </View>
      </View>

      <View className="recipe-editor-section">
        <Text className="recipe-editor-label">菜谱名称 *</Text>
        <Input
          className="recipe-editor-input recipe-editor-input--title"
          maxlength={120}
          value={name}
          placeholder="例如：外婆红烧肉"
          onInput={(event) => setName(event.detail.value)}
        />
        <Text className="recipe-editor-label">菜谱介绍</Text>
        <Textarea
          className="recipe-editor-textarea"
          maxlength={2_000}
          value={description}
          placeholder="这道菜的特点、故事或家人的回忆…"
          onInput={(event) => setDescription(event.detail.value)}
        />
        <Text className="recipe-editor-label">分类</Text>
        <View className="recipe-editor-category-options">
          {recipeCategories.map((item) => (
            <Button
              className={category === item.value ? "is-active" : ""}
              key={item.value}
              onClick={() => setCategory(item.value)}
            >
              {item.icon} {item.label}
            </Button>
          ))}
        </View>
        <Text className="recipe-editor-label">制作时间</Text>
        <View className="recipe-editor-inline-input">
          <Input
            type="number"
            value={cookMinutes}
            placeholder="例如 30"
            onInput={(event) => setCookMinutes(event.detail.value)}
          />
          <Text>分钟</Text>
        </View>
      </View>

      <View className="recipe-editor-section">
        <View className="recipe-editor-section-title">
          <Text>用料 *</Text>
          <Text>名称、用量和单位</Text>
        </View>
        {ingredients.map((ingredient) => (
          <View className="recipe-editor-ingredient" key={ingredient.key}>
            <Input
              value={ingredient.name}
              placeholder="食材名称"
              onInput={(event) =>
                updateIngredient(ingredient.key, "name", event.detail.value)
              }
            />
            <Input
              type="digit"
              value={ingredient.quantity}
              placeholder="用量"
              onInput={(event) =>
                updateIngredient(ingredient.key, "quantity", event.detail.value)
              }
            />
            <Input
              value={ingredient.unit}
              placeholder="单位"
              onInput={(event) =>
                updateIngredient(ingredient.key, "unit", event.detail.value)
              }
            />
            <Picker
              range={ingredientCategories.map((item) => item.label)}
              value={Math.max(
                0,
                ingredientCategories.findIndex(
                  (item) => item.value === ingredient.category,
                ),
              )}
              onChange={(event) =>
                updateIngredient(
                  ingredient.key,
                  "category",
                  ingredientCategories[Number(event.detail.value)]?.value ??
                    "other",
                )
              }
            >
              <View className="recipe-editor-ingredient__category">
                {ingredientCategories.find(
                  (item) => item.value === ingredient.category,
                )?.label ?? "其它"}
              </View>
            </Picker>
            <Button onClick={() => removeIngredient(ingredient.key)}>×</Button>
          </View>
        ))}
        <Button
          className="recipe-editor-add-line"
          onClick={() =>
            setIngredients((current) => [...current, emptyIngredient()])
          }
        >
          ＋ 添加一行用料
        </Button>
      </View>

      <View className="recipe-editor-section">
        <View className="recipe-editor-section-title">
          <Text>做法步骤 *</Text>
          <Text>写清动作、火候和时间</Text>
        </View>
        {steps.map((step, index) => (
          <View className="recipe-editor-step" key={step.key}>
            <Text className="recipe-editor-step__number">{index + 1}</Text>
            <Textarea
              maxlength={2_000}
              value={step.instruction}
              placeholder="填写这一步怎么做…"
              onInput={(event) => updateStep(step.key, event.detail.value)}
            />
            <Button onClick={() => removeStep(step.key)}>×</Button>
          </View>
        ))}
        <Button
          className="recipe-editor-add-line"
          onClick={() => setSteps((current) => [...current, emptyStep()])}
        >
          ＋ 添加下一步骤
        </Button>
      </View>

      <View className="recipe-editor-section">
        <Text className="recipe-editor-label">小贴士</Text>
        <Textarea
          className="recipe-editor-textarea"
          maxlength={2_000}
          value={tips}
          placeholder="容易失败的地方、食材替换或家人口味偏好…"
          onInput={(event) => setTips(event.detail.value)}
        />
      </View>

      <View className="recipe-editor-section">
        <Text className="recipe-editor-label">点菜状态</Text>
        <View className="recipe-editor-state-options">
          {(["available", "want_to_learn"] as const).map((state) => (
            <Button
              className={orderingState === state ? "is-active" : ""}
              key={state}
              onClick={() => setOrderingState(state)}
            >
              <Text>{recipeOrderingStateLabels[state]}</Text>
              <Text>
                {state === "available"
                  ? "保存后家人可以直接点"
                  : "先收进菜谱，暂不出现在点菜页"}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      <View className="recipe-editor-footer">
        <Button loading={saving} disabled={saving} onClick={handleSave}>
          保存菜谱
        </Button>
      </View>
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}
