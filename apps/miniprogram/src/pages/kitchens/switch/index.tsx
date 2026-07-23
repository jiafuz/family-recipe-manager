import type { KitchenSummary } from "@jiayan/contracts";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";

import {
  getStoredCurrentKitchenId,
  listKitchens,
  storeCurrentKitchen,
} from "../../../services/api-client";

import "../shared.scss";

export default function SwitchKitchenPage(): JSX.Element {
  const [kitchens, setKitchens] = useState<KitchenSummary[]>([]);
  const [currentKitchenId, setCurrentKitchenId] = useState(
    getStoredCurrentKitchenId(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useLoad(() => {
    void listKitchens()
      .then(setKitchens)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "暂时无法读取厨房列表",
        ),
      )
      .finally(() => setLoading(false));
  });

  const selectKitchen = async (kitchen: KitchenSummary): Promise<void> => {
    storeCurrentKitchen(kitchen.id);
    setCurrentKitchenId(kitchen.id);
    await Taro.showToast({ title: `已切换到${kitchen.name}`, icon: "none" });
    await Taro.navigateBack();
  };

  return (
    <View className="kitchen-task-page">
      <View className="kitchen-task-header">
        <Button hoverClass="none" onClick={() => void Taro.navigateBack()}>
          ‹
        </Button>
        <Text>切换厨房</Text>
        <View />
      </View>
      <View className="kitchen-task-intro">
        <Text>选择当前厨房</Text>
        <Text>菜谱、菜单和采购清单都会随厨房切换，彼此不会混在一起。</Text>
      </View>
      {loading ? (
        <View className="kitchen-loading-state">正在读取厨房…</View>
      ) : (
        <View className="kitchen-form-section">
          {kitchens.map((kitchen) => (
            <View
              className="kitchen-list-item"
              key={kitchen.id}
              onClick={() => void selectKitchen(kitchen)}
            >
              <Text className="kitchen-list-item__icon">{kitchen.icon}</Text>
              <View className="kitchen-list-item__content">
                <Text>{kitchen.name}</Text>
                <Text>
                  {kitchen.memberCount} 位成员 ·{" "}
                  {kitchen.role === "owner" ? "我创建的" : "已加入"}
                </Text>
              </View>
              <Text className="kitchen-list-item__status">
                {kitchen.id === currentKitchenId ? "当前" : "选择"}
              </Text>
            </View>
          ))}
        </View>
      )}
      {error ? <Text className="kitchen-error">{error}</Text> : null}
    </View>
  );
}
