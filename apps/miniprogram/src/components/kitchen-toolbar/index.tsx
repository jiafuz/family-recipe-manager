import { Text, View } from "@tarojs/components";

import "./index.scss";

export interface KitchenToolbarProps {
  kitchenName?: string;
  memberCount?: number;
}

export function KitchenToolbar({
  kitchenName = "我的家",
  memberCount = 1,
}: KitchenToolbarProps): JSX.Element {
  return (
    <View className="kitchen-toolbar">
      <View className="kitchen-toolbar__space">
        <Text className="kitchen-toolbar__avatar">🏠</Text>
        <View>
          <Text className="kitchen-toolbar__name">{kitchenName}</Text>
          <Text className="kitchen-toolbar__meta">{memberCount} 位成员</Text>
        </View>
      </View>
    </View>
  );
}
