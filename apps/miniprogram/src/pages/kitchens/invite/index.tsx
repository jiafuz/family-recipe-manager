import type { KitchenDetail, KitchenInviteResponse } from "@jiayan/contracts";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useLoad, useRouter, useShareAppMessage } from "@tarojs/taro";
import { useState } from "react";

import {
  createKitchenInvite,
  getKitchenDetail,
} from "../../../services/api-client";

import "../shared.scss";

export default function InviteKitchenMemberPage(): JSX.Element {
  const kitchenId = useRouter().params.kitchenId ?? "";
  const [kitchen, setKitchen] = useState<KitchenDetail | null>(null);
  const [invite, setInvite] = useState<KitchenInviteResponse | null>(null);
  const [error, setError] = useState("");

  useLoad(() => {
    if (!kitchenId) {
      setError("缺少厨房信息");
      return;
    }
    void Promise.all([
      getKitchenDetail(kitchenId),
      createKitchenInvite(kitchenId),
    ])
      .then(([detail, createdInvite]) => {
        setKitchen(detail);
        setInvite(createdInvite);
      })
      .catch((cause: unknown) => setError(getErrorMessage(cause)));
  });

  useShareAppMessage(() =>
    Promise.resolve({
      title: `${kitchen?.name ?? "家人"}邀请你一起点菜`,
      path: invite
        ? `/pages/kitchens/join/index?inviteCode=${invite.code}`
        : "/pages/ordering/index",
    }),
  );

  const copyInvite = async (): Promise<void> => {
    if (!invite) return;
    await Taro.setClipboardData({ data: invite.code });
  };

  return (
    <View className="kitchen-task-page">
      <View className="kitchen-task-header">
        <Button hoverClass="none" onClick={() => void Taro.navigateBack()}>
          ‹
        </Button>
        <Text>邀请家庭成员</Text>
        <View />
      </View>
      <View className="kitchen-task-intro">
        <Text>{kitchen?.name ?? "家庭厨房"}</Text>
        <Text>邀请家人加入后，大家可以共同点菜、编辑菜单和查看采购清单。</Text>
      </View>
      <View className="kitchen-invite-card">
        <Text className="kitchen-section-title">专属邀请码</Text>
        {invite ? (
          <>
            <Text className="kitchen-invite-code">{invite.code}</Text>
            <Text className="kitchen-invite-meta">
              有效至 {formatDateTime(invite.expiresAt)} · 最多可使用{" "}
              {invite.maxUses} 次
            </Text>
            <View className="kitchen-invite-actions">
              <Button
                className="kitchen-secondary-action"
                hoverClass="none"
                onClick={() => void copyInvite()}
              >
                复制邀请码
              </Button>
              <Button
                className="kitchen-primary-action"
                hoverClass="none"
                openType="share"
              >
                分享给微信好友
              </Button>
            </View>
          </>
        ) : error ? (
          <Text className="kitchen-error">{error}</Text>
        ) : (
          <View className="kitchen-loading-state">正在生成邀请码…</View>
        )}
      </View>
      <View className="kitchen-form-section">
        <Text className="kitchen-section-title">温馨提示</Text>
        <Text className="kitchen-invite-meta">
          邀请码仅用于加入家庭厨房，请只分享给认识的家人。过期后可以重新生成。
        </Text>
      </View>
    </View>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "暂时无法生成邀请码";
}
