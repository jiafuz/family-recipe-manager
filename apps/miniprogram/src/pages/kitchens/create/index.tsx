import { Button, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import { createKitchen } from "../../../services/api-client";

import "../shared.scss";

const kitchenIcons = [
  "🏠",
  "🏡",
  "🏘️",
  "🏯",
  "🌿",
  "🌟",
  "🍲",
  "🥢",
  "🌸",
  "❤️",
];

export default function CreateKitchenPage(): JSX.Element {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏠");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await createKitchen({ name: trimmedName, icon });
      await Taro.showToast({ title: "厨房已创建", icon: "success" });
      await returnToPreviousPage();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="kitchen-task-page">
      <Header title="创建厨房" />
      <View className="kitchen-task-intro">
        <Text>给家人一个共同的厨房</Text>
        <Text>创建后即可邀请成员，所有人使用同一份菜谱、菜单和采购清单。</Text>
      </View>
      <View className="kitchen-form-section">
        <Text className="kitchen-field-label">厨房图标</Text>
        <View className="kitchen-icon-grid">
          {kitchenIcons.map((item) => (
            <Button
              className={item === icon ? "is-active" : ""}
              hoverClass="none"
              key={item}
              onClick={() => setIcon(item)}
            >
              {item}
            </Button>
          ))}
        </View>
      </View>
      <View className="kitchen-form-section">
        <Text className="kitchen-field-label">厨房名称</Text>
        <Input
          className="kitchen-field-input"
          maxlength={20}
          placeholder="例如：我们家的厨房"
          value={name}
          onInput={(event) => setName(event.detail.value)}
        />
      </View>
      {error ? <Text className="kitchen-error">{error}</Text> : null}
      <Button
        className="kitchen-primary-action"
        disabled={!name.trim() || submitting}
        loading={submitting}
        onClick={() => void submit()}
      >
        创建厨房
      </Button>
    </View>
  );
}

function Header({ title }: { title: string }): JSX.Element {
  return (
    <View className="kitchen-task-header">
      <Button hoverClass="none" onClick={() => void returnToPreviousPage()}>
        ‹
      </Button>
      <Text>{title}</Text>
      <View />
    </View>
  );
}

async function returnToPreviousPage(): Promise<void> {
  try {
    await Taro.navigateBack();
  } catch {
    await Taro.switchTab({ url: "/pages/ordering/index" });
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "暂时无法创建厨房";
}
