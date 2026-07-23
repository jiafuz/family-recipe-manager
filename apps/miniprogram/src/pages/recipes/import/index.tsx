import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState } from "react";

import {
  ApiClientError,
  createRecipeImport,
} from "../../../services/api-client";

import "./index.scss";

export default function RecipeImportPage(): JSX.Element {
  const router = useRouter();
  const kitchenId = router.params.kitchenId ?? "";
  const [sourceUrl, setSourceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pasteFromClipboard = async (): Promise<void> => {
    try {
      const result = await Taro.getClipboardData();
      setSourceUrl(result.data.trim());
    } catch {
      await Taro.showToast({ title: "没有读取到剪贴板内容", icon: "none" });
    }
  };

  const submit = async (): Promise<void> => {
    if (!kitchenId) {
      await Taro.showToast({ title: "缺少厨房信息", icon: "none" });
      return;
    }
    const url = sourceUrl.trim();
    if (!url) {
      await Taro.showToast({ title: "请粘贴菜谱链接", icon: "none" });
      return;
    }
    if (!url.startsWith("https://")) {
      await Taro.showToast({ title: "请输入完整的 HTTPS 链接", icon: "none" });
      return;
    }

    setSubmitting(true);
    try {
      const recipeImport = await createRecipeImport({ kitchenId, url });
      await Taro.navigateTo({
        url: `/pages/recipes/editor/index?kitchenId=${encodeURIComponent(kitchenId)}&importId=${encodeURIComponent(recipeImport.id)}`,
      });
    } catch (error) {
      await Taro.showModal({
        title: "暂时无法导入",
        content: getErrorMessage(error),
        showCancel: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="recipe-import-page">
      <View className="recipe-import-header">
        <Button onClick={() => Taro.navigateBack()}>‹</Button>
        <Text>链接导入</Text>
        <Text />
      </View>

      <View className="recipe-import-intro">
        <Text className="recipe-import-intro__icon">🔗</Text>
        <Text className="recipe-import-intro__title">把喜欢的做法带回家</Text>
        <Text className="recipe-import-intro__copy">
          支持小红书和下厨房。系统会尽量识别菜名、用料与步骤，再由你核对保存。
        </Text>
      </View>

      <View className="recipe-import-form">
        <Text className="recipe-import-form__label">菜谱链接</Text>
        <View className="recipe-import-input-row">
          <Input
            value={sourceUrl}
            maxlength={2_048}
            placeholder="粘贴 https:// 开头的链接"
            onInput={(event) => setSourceUrl(event.detail.value)}
          />
          <Button onClick={pasteFromClipboard}>粘贴</Button>
        </View>
        <View className="recipe-import-platforms">
          <Text>小红书</Text>
          <Text>下厨房</Text>
        </View>
      </View>

      <View className="recipe-import-flow">
        <Text className="recipe-import-flow__title">导入后会怎样？</Text>
        {[
          {
            number: "1",
            title: "读取公开页面",
            copy: "只读取你主动提交的这一个链接",
          },
          {
            number: "2",
            title: "生成待核对草稿",
            copy: "无法稳定识别的内容会明确提醒你补充",
          },
          {
            number: "3",
            title: "确认后保存",
            copy: "保存为我家的独立版本，不会改动原页面",
          },
        ].map((step) => (
          <View className="recipe-import-step" key={step.number}>
            <Text className="recipe-import-step__number">{step.number}</Text>
            <View>
              <Text className="recipe-import-step__title">{step.title}</Text>
              <Text className="recipe-import-step__copy">{step.copy}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="recipe-import-notice">
        <Text>说明</Text>
        <Text>
          第三方页面结构可能变化，导入结果仅作为草稿；图片不会直接复制，请使用自己的成品图。
        </Text>
      </View>

      <View className="recipe-import-footer">
        <Button loading={submitting} disabled={submitting} onClick={submit}>
          生成待核对草稿
        </Button>
      </View>
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "导入失败，请稍后重试";
}
