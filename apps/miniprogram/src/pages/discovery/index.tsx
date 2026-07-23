import { FoundationCard } from "../../components/foundation-card";
import { KitchenToolbar } from "../../components/kitchen-toolbar";
import { useCurrentKitchen } from "../../features/kitchens/use-current-kitchen";

export default function DiscoveryPage(): JSX.Element {
  const kitchen = useCurrentKitchen();
  return (
    <>
      <KitchenToolbar
        kitchenId={kitchen?.id}
        kitchenName={kitchen?.name ?? "我的家"}
        memberCount={kitchen?.memberCount ?? 1}
      />
      <FoundationCard
        title="发现工程已就绪"
        description="菜谱广场和分享广场将分阶段接入；公开内容在审核和举报能力完成后开放。"
      />
    </>
  );
}
