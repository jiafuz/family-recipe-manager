import type { RecipeCategory, RecipeOrderingState } from "@jiayan/contracts";

export const recipeCategories: Array<{
  value: RecipeCategory;
  label: string;
  icon: string;
}> = [
  { value: "vegetable", label: "蔬菜", icon: "🥬" },
  { value: "meat", label: "肉类", icon: "🥩" },
  { value: "fish", label: "鱼虾", icon: "🐟" },
  { value: "soup", label: "汤羹", icon: "🥣" },
  { value: "egg", label: "禽蛋", icon: "🥚" },
  { value: "staple", label: "主食", icon: "🍚" },
  { value: "other", label: "其它", icon: "🍽️" },
];

export const recipeOrderingStateLabels: Record<RecipeOrderingState, string> = {
  available: "开放点菜",
  want_to_learn: "想学先存",
  hidden: "已隐藏",
};

export function getRecipeCategoryLabel(category: RecipeCategory): string {
  return (
    recipeCategories.find((item) => item.value === category)?.label ?? "其它"
  );
}
