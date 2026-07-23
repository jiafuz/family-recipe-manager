import { describe, expect, it } from "vitest";

import {
  createIngredientKey,
  deriveProcurementItems,
  type IngredientSource,
} from "./derive-procurement-items";

const sources: IngredientSource[] = [
  {
    mealItemId: "meal_item_fish",
    mealType: "lunch",
    recipeName: "清蒸鲈鱼",
    ingredientName: "姜",
    category: "调味",
    quantity: 10,
    unit: "克",
  },
  {
    mealItemId: "meal_item_egg",
    mealType: "dinner",
    recipeName: "番茄炒蛋",
    ingredientName: "姜",
    category: "调味",
    quantity: 5,
    unit: "克",
  },
];

describe("deriveProcurementItems", () => {
  it("合并同名同单位食材并保留来源", () => {
    const result = deriveProcurementItems(sources);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      displayName: "姜",
      totalQuantity: 15,
      unit: "克",
      needed: true,
    });
    expect(result[0]?.sources).toHaveLength(2);
  });

  it("保留仍存在食材的采购选择", () => {
    const key = createIngredientKey("姜", "克");
    const result = deriveProcurementItems(
      sources.slice(0, 1),
      new Map([[key, false]]),
    );

    expect(result[0]?.needed).toBe(false);
    expect(result[0]?.totalQuantity).toBe(10);
  });

  it("新增食材默认需要购买", () => {
    const result = deriveProcurementItems(sources, new Map());

    expect(result[0]?.needed).toBe(true);
  });
});
