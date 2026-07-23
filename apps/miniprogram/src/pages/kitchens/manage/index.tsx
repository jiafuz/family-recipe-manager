import type { KitchenDetail, KitchenMember } from "@jiayan/contracts";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useLoad, useRouter } from "@tarojs/taro";
import { useState } from "react";

import {
  clearStoredCurrentKitchen,
  deleteKitchen,
  ensureSignedIn,
  getKitchenDetail,
  leaveKitchen,
  listKitchens,
  removeKitchenMember,
  storeCurrentKitchen,
  updateKitchen,
} from "../../../services/api-client";

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

export default function ManageKitchenPage(): JSX.Element {
  const kitchenId = useRouter().params.kitchenId ?? "";
  const [kitchen, setKitchen] = useState<KitchenDetail | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏠");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useLoad(() => {
    if (!kitchenId) {
      setError("缺少厨房信息");
      setLoading(false);
      return;
    }
    void Promise.all([getKitchenDetail(kitchenId), ensureSignedIn()])
      .then(([detail, current]) => {
        setKitchen(detail);
        setCurrentUserId(current.user.id);
        setName(detail.name);
        setIcon(detail.icon);
      })
      .catch((cause: unknown) => setError(getErrorMessage(cause)))
      .finally(() => setLoading(false));
  });

  const save = async (): Promise<void> => {
    if (!kitchen || kitchen.role !== "owner" || !name.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const updated = await updateKitchen(kitchen.id, {
        name: name.trim(),
        icon,
      });
      setKitchen(updated);
      setName(updated.name);
      setIcon(updated.icon);
      await Taro.showToast({ title: "厨房资料已保存", icon: "success" });
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const removeMember = async (member: KitchenMember): Promise<void> => {
    if (!kitchen) return;
    const decision = await Taro.showModal({
      title: "移除家庭成员",
      content: `确定将“${member.nickname || member.displayName}”移出${kitchen.name}吗？`,
      confirmText: "移除",
      confirmColor: "#b63b2c",
    });
    if (!decision.confirm) return;

    try {
      setKitchen(await removeKitchenMember(kitchen.id, member.userId));
      await Taro.showToast({ title: "成员已移除", icon: "none" });
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const leaveOrDelete = async (): Promise<void> => {
    if (!kitchen) return;
    const isOwner = kitchen.role === "owner";
    const decision = await Taro.showModal({
      title: isOwner ? "解散厨房" : "退出厨房",
      content: isOwner
        ? `解散后，所有成员将无法继续访问“${kitchen.name}”。历史数据会按隐私政策进入保留和删除流程。`
        : `退出后，你将无法继续访问“${kitchen.name}”的菜谱、菜单和采购清单。`,
      confirmText: isOwner ? "确认解散" : "确认退出",
      confirmColor: "#b63b2c",
    });
    if (!decision.confirm) return;

    setSubmitting(true);
    try {
      if (isOwner) await deleteKitchen(kitchen.id);
      else await leaveKitchen(kitchen.id);
      await chooseFallbackKitchen();
      await Taro.showToast({
        title: isOwner ? "厨房已解散" : "已退出厨房",
        icon: "none",
      });
      await Taro.switchTab({ url: "/pages/ordering/index" });
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View className="kitchen-loading-state">正在读取厨房信息…</View>;
  }

  if (!kitchen) {
    return (
      <View className="kitchen-task-page">
        <View className="kitchen-task-header">
          <Button hoverClass="none" onClick={() => void Taro.navigateBack()}>
            ‹
          </Button>
          <Text>编辑厨房</Text>
          <View />
        </View>
        <Text className="kitchen-error">{error || "没有找到这个厨房"}</Text>
      </View>
    );
  }

  const isOwner = kitchen.role === "owner";

  return (
    <View className="kitchen-task-page">
      <View className="kitchen-task-header">
        <Button hoverClass="none" onClick={() => void Taro.navigateBack()}>
          ‹
        </Button>
        <Text>编辑厨房</Text>
        <View />
      </View>
      <View className="kitchen-task-intro">
        <Text>
          {kitchen.icon} {kitchen.name}
        </Text>
        <Text>{kitchen.memberCount} 位成员共同使用这份家庭菜谱与菜单。</Text>
      </View>

      {isOwner ? (
        <View className="kitchen-form-section">
          <Text className="kitchen-field-label">厨房名称</Text>
          <Input
            className="kitchen-field-input"
            maxlength={20}
            value={name}
            onInput={(event) => setName(event.detail.value)}
          />
          <Text className="kitchen-field-label" style={{ marginTop: "18px" }}>
            厨房图标
          </Text>
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
          <Button
            className="kitchen-primary-action"
            disabled={!name.trim() || submitting}
            loading={submitting}
            onClick={() => void save()}
          >
            保存修改
          </Button>
        </View>
      ) : null}

      <View className="kitchen-member-section">
        <Text className="kitchen-section-title">家庭成员</Text>
        {kitchen.members.map((member) => (
          <View className="kitchen-member-item" key={member.userId}>
            <Text className="kitchen-member-item__avatar">
              {member.role === "owner" ? "👑" : member.displayName.slice(0, 1)}
            </Text>
            <View className="kitchen-member-item__content">
              <Text>
                {member.nickname || member.displayName}
                {member.userId === currentUserId ? "（我）" : ""}
              </Text>
              <Text>{member.role === "owner" ? "厨房创建者" : "家庭成员"}</Text>
            </View>
            {isOwner && member.role !== "owner" ? (
              <Button
                hoverClass="none"
                onClick={() => void removeMember(member)}
              >
                移除
              </Button>
            ) : null}
          </View>
        ))}
        <Button
          className="kitchen-secondary-action"
          hoverClass="none"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/kitchens/invite/index?kitchenId=${encodeURIComponent(kitchen.id)}`,
            })
          }
        >
          ＋ 邀请新成员
        </Button>
      </View>

      <View className="kitchen-danger-section">
        <Text className="kitchen-section-title">
          {isOwner ? "解散厨房" : "退出厨房"}
        </Text>
        <Text className="kitchen-invite-meta">
          {isOwner
            ? "这是不可直接撤销的操作，请确认所有家庭成员都已知晓。"
            : "如需再次加入，需要家人重新提供有效邀请码。"}
        </Text>
        <Button
          className="kitchen-danger-action"
          disabled={submitting}
          onClick={() => void leaveOrDelete()}
        >
          {isOwner ? "解散这个厨房" : "退出这个厨房"}
        </Button>
      </View>
      {error ? <Text className="kitchen-error">{error}</Text> : null}
    </View>
  );
}

async function chooseFallbackKitchen(): Promise<void> {
  clearStoredCurrentKitchen();
  try {
    const remaining = await listKitchens();
    if (remaining[0]) storeCurrentKitchen(remaining[0].id);
  } catch {
    // The destructive operation has already succeeded. The ordering page will
    // refresh the kitchen list when network access is available again.
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
