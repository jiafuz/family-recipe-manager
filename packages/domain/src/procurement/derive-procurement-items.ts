export interface IngredientSource {
  mealPlanId?: string;
  mealItemId: string;
  recipeIngredientId?: string;
  mealType: "breakfast" | "lunch" | "dinner";
  recipeName: string;
  ingredientName: string;
  category: string;
  quantity: number | null;
  unit: string | null;
}

export interface ProcurementSource extends IngredientSource {}

export interface ProcurementItem {
  ingredientKey: string;
  displayName: string;
  category: string;
  totalQuantity: number | null;
  unit: string | null;
  needed: boolean;
  sources: ProcurementSource[];
}

export type PreviousProcurementSelections = ReadonlyMap<string, boolean>;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

export function createIngredientKey(
  ingredientName: string,
  unit: string | null,
): string {
  return `${normalizeText(ingredientName)}::${normalizeText(unit ?? "")}`;
}

export function deriveProcurementItems(
  ingredientSources: readonly IngredientSource[],
  previousSelections: PreviousProcurementSelections = new Map(),
): ProcurementItem[] {
  const grouped = new Map<string, ProcurementItem>();

  for (const source of ingredientSources) {
    const ingredientKey = createIngredientKey(
      source.ingredientName,
      source.unit,
    );
    const existing = grouped.get(ingredientKey);

    if (!existing) {
      grouped.set(ingredientKey, {
        ingredientKey,
        displayName: source.ingredientName.trim(),
        category: source.category,
        totalQuantity: source.quantity,
        unit: source.unit,
        needed: previousSelections.get(ingredientKey) ?? true,
        sources: [{ ...source }],
      });
      continue;
    }

    existing.sources.push({ ...source });

    if (existing.totalQuantity !== null && source.quantity !== null) {
      existing.totalQuantity += source.quantity;
    } else {
      existing.totalQuantity = null;
    }
  }

  return [...grouped.values()].sort((left, right) => {
    const categoryOrder = left.category.localeCompare(right.category, "zh-CN");
    return (
      categoryOrder ||
      left.displayName.localeCompare(right.displayName, "zh-CN")
    );
  });
}
