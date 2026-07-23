import { FoundationCard } from "../../components/foundation-card";
import { KitchenToolbar } from "../../components/kitchen-toolbar";
import { useCurrentKitchen } from "../../features/kitchens/use-current-kitchen";

export default function ProfilePage(): JSX.Element {
  const kitchen = useCurrentKitchen();
  return (
    <>
      <KitchenToolbar
        kitchenId={kitchen?.id}
        kitchenName={kitchen?.name ?? "我的家"}
        memberCount={kitchen?.memberCount ?? 1}
      />
      <FoundationCard
        title="个人中心工程已就绪"
        description="这里将逐步接入制作回忆、营养分析、隐私设置、数据导出和账号注销。"
      />
    </>
  );
}
