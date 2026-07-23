import type { KitchenInvitePreview } from "@jiayan/contracts";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState } from "react";

import {
  joinKitchen,
  previewKitchenInvite,
} from "../../../services/api-client";

import "../shared.scss";

export default function JoinKitchenPage(): JSX.Element {
  const router = useRouter();
  const initialCode = (router.params.inviteCode ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<KitchenInvitePreview | null>(null);
  const [error, setError] = useState("");

  const submit = async (): Promise<void> => {
    if (!/^\d{6}$/.test(inviteCode) || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (!preview) {
        setPreview(await previewKitchenInvite({ inviteCode }));
        return;
      }
      await joinKitchen({ inviteCode });
      await Taro.showToast({ title: "已加入厨房", icon: "success" });
      await returnToPreviousPage();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="kitchen-task-page">
      <View className="kitchen-task-header">
        <Button hoverClass="none" onClick={() => void returnToPreviousPage()}>
          ‹
        </Button>
        <Text>加入厨房</Text>
        <View />
      </View>
      <View className="kitchen-task-intro">
        <Text>和家人一起点菜</Text>
        <Text>输入家人分享的 6 位邀请码，加入后即可看到共同菜谱和菜单。</Text>
      </View>
      <View className="kitchen-form-section">
        <Text className="kitchen-field-label">家庭邀请码</Text>
        <Input
          className="kitchen-join-code"
          focus
          maxlength={6}
          placeholder="000000"
          type="number"
          value={inviteCode}
          onInput={(event) => {
            setInviteCode(event.detail.value.replace(/\D/g, "").slice(0, 6));
            setPreview(null);
            setError("");
          }}
        />
        <Text className="kitchen-invite-meta">
          邀请码由厨房成员提供，有效期为 7 天
        </Text>
      </View>
      {preview ? (
        <View className="kitchen-form-section">
          <View className="kitchen-list-item">
            <Text className="kitchen-list-item__icon">
              {preview.kitchenIcon}
            </Text>
            <View className="kitchen-list-item__content">
              <Text>{preview.kitchenName}</Text>
              <Text>{preview.memberCount} 位家庭成员 · 请确认后加入</Text>
            </View>
          </View>
        </View>
      ) : null}
      {error ? <Text className="kitchen-error">{error}</Text> : null}
      <Button
        className="kitchen-primary-action"
        disabled={!/^\d{6}$/.test(inviteCode) || submitting}
        loading={submitting}
        onClick={() => void submit()}
      >
        {preview ? `确认加入${preview.kitchenName}` : "查看厨房"}
      </Button>
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
  return error instanceof Error ? error.message : "暂时无法加入厨房";
}
