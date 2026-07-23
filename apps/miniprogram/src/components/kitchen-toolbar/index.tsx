import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import {
  ensureSignedIn,
  getStoredCurrentKitchenId,
} from "../../services/api-client";

import "./index.scss";

export interface KitchenToolbarProps {
  kitchenId?: string | undefined;
  kitchenName?: string;
  memberCount?: number;
}

export function KitchenToolbar({
  kitchenId,
  kitchenName = "我的家",
  memberCount = 1,
}: KitchenToolbarProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [availableKitchenCount, setAvailableKitchenCount] = useState(1);
  const [activeKitchenId, setActiveKitchenId] = useState(
    kitchenId ?? getStoredCurrentKitchenId(),
  );

  const openMenu = async (): Promise<void> => {
    setMenuOpen(true);
    try {
      const current = await ensureSignedIn();
      setAvailableKitchenCount(current.kitchens.length);
      setActiveKitchenId(
        kitchenId ??
          getStoredCurrentKitchenId() ??
          current.currentKitchen?.id ??
          current.kitchens[0]?.id ??
          null,
      );
    } catch {
      // Keep the create/join actions available when status refresh fails.
    }
  };

  const navigate = async (url: string): Promise<void> => {
    setMenuOpen(false);
    await Taro.navigateTo({ url });
  };

  return (
    <>
      <View className="kitchen-toolbar">
        <Button
          className="kitchen-toolbar__space"
          hoverClass="none"
          onClick={() => void openMenu()}
        >
          <Text className="kitchen-toolbar__avatar">🏠</Text>
          <View>
            <Text className="kitchen-toolbar__name">{kitchenName}</Text>
            <Text className="kitchen-toolbar__meta">{memberCount} 位成员</Text>
          </View>
          <Text className="kitchen-toolbar__chevron">⌄</Text>
        </Button>
      </View>

      {menuOpen ? (
        <>
          <View
            className="kitchen-toolbar-menu__mask"
            onClick={() => setMenuOpen(false)}
          />
          <View className="kitchen-toolbar-menu">
            {availableKitchenCount >= 2 ? (
              <Button
                hoverClass="none"
                onClick={() => void navigate("/pages/kitchens/switch/index")}
              >
                <Text>⇄</Text>
                <View>
                  <Text>切换厨房</Text>
                  <Text>选择另一个家庭空间</Text>
                </View>
              </Button>
            ) : null}
            <Button
              hoverClass="none"
              onClick={() => void navigate("/pages/kitchens/create/index")}
            >
              <Text>＋</Text>
              <View>
                <Text>创建厨房</Text>
                <Text>建立新的家庭空间</Text>
              </View>
            </Button>
            <Button
              hoverClass="none"
              onClick={() => void navigate("/pages/kitchens/join/index")}
            >
              <Text>⌁</Text>
              <View>
                <Text>加入厨房</Text>
                <Text>输入家人提供的邀请码</Text>
              </View>
            </Button>
            {activeKitchenId ? (
              <Button
                hoverClass="none"
                onClick={() =>
                  void navigate(
                    `/pages/kitchens/manage/index?kitchenId=${encodeURIComponent(activeKitchenId)}`,
                  )
                }
              >
                <Text>⚙</Text>
                <View>
                  <Text>编辑厨房</Text>
                  <Text>管理资料、成员和邀请</Text>
                </View>
              </Button>
            ) : null}
          </View>
        </>
      ) : null}
    </>
  );
}
