import { Text, View } from "@tarojs/components";
import type { PropsWithChildren } from "react";

import "./index.scss";

export interface FoundationCardProps extends PropsWithChildren {
  title: string;
  description: string;
}

export function FoundationCard({
  title,
  description,
  children,
}: FoundationCardProps): JSX.Element {
  return (
    <View className="foundation-card">
      <Text className="foundation-card__title">{title}</Text>
      <Text className="foundation-card__description">{description}</Text>
      {children}
    </View>
  );
}
