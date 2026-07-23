import Taro from "@tarojs/taro";

export async function openAddRecipeMenu(kitchenId: string): Promise<void> {
  const result = await Taro.showActionSheet({
    itemList: ["手动录入", "菜谱广场", "链接导入"],
  }).catch(() => null);
  if (!result) return;

  if (result.tapIndex === 0) {
    await Taro.navigateTo({
      url: `/pages/recipes/editor/index?kitchenId=${encodeURIComponent(kitchenId)}`,
    });
  } else if (result.tapIndex === 1) {
    await Taro.switchTab({ url: "/pages/discovery/index" });
  } else if (result.tapIndex === 2) {
    await Taro.navigateTo({
      url: `/pages/recipes/import/index?kitchenId=${encodeURIComponent(kitchenId)}`,
    });
  }
}
