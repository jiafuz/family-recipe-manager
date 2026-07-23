import type { MealType } from "@jiayan/contracts";
import Taro from "@tarojs/taro";

export const ORDERING_DRAFT_STORAGE_KEY = "jiayan.ordering-draft.v1";
export const MEAL_RECORD_FOCUS_STORAGE_KEY = "jiayan.meal-record-focus.v1";
export const ORDERING_EDIT_CONTEXT_STORAGE_KEY =
  "jiayan.ordering-edit-context.v1";

export interface OrderingDraftItem {
  itemId?: string;
  recipeId: string;
  recipeVersionId: string;
  name: string;
  coverEmoji: string;
  quantity: number;
  tasteNote: string | null;
}

export interface OrderingDraft {
  kitchenId: string;
  items: OrderingDraftItem[];
}

export interface MealRecordFocus {
  date: string;
  mealType: MealType;
}

export interface OrderingEditContext {
  kitchenId: string;
  date: string;
  mealType: MealType;
}

export function loadOrderingDraft(): OrderingDraft | null {
  try {
    const draft = Taro.getStorageSync<OrderingDraft>(
      ORDERING_DRAFT_STORAGE_KEY,
    );
    return draft?.kitchenId && draft.items?.length ? draft : null;
  } catch {
    return null;
  }
}

export function saveOrderingDraft(draft: OrderingDraft): void {
  Taro.setStorageSync(ORDERING_DRAFT_STORAGE_KEY, draft);
}

export function clearOrderingDraft(): void {
  Taro.removeStorageSync(ORDERING_DRAFT_STORAGE_KEY);
}

export function loadOrderingEditContext(): OrderingEditContext | null {
  try {
    const context = Taro.getStorageSync<OrderingEditContext>(
      ORDERING_EDIT_CONTEXT_STORAGE_KEY,
    );
    return context?.kitchenId && context.date && context.mealType
      ? context
      : null;
  } catch {
    return null;
  }
}

export function saveOrderingEditContext(context: OrderingEditContext): void {
  Taro.setStorageSync(ORDERING_EDIT_CONTEXT_STORAGE_KEY, context);
}

export function clearOrderingEditContext(): void {
  Taro.removeStorageSync(ORDERING_EDIT_CONTEXT_STORAGE_KEY);
}

export function saveMealRecordFocus(focus: MealRecordFocus): void {
  Taro.setStorageSync(MEAL_RECORD_FOCUS_STORAGE_KEY, focus);
}

export function consumeMealRecordFocus(): MealRecordFocus | null {
  try {
    const focus = Taro.getStorageSync<MealRecordFocus>(
      MEAL_RECORD_FOCUS_STORAGE_KEY,
    );
    Taro.removeStorageSync(MEAL_RECORD_FOCUS_STORAGE_KEY);
    return focus?.date && focus.mealType ? focus : null;
  } catch {
    return null;
  }
}
