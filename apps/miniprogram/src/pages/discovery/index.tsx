import { FoundationCard } from "../../components/foundation-card";
import { KitchenToolbar } from "../../components/kitchen-toolbar";

export default function DiscoveryPage(): JSX.Element {
  return (
    <>
      <KitchenToolbar />
      <FoundationCard
        title="发现工程已就绪"
        description="菜谱广场和分享广场将分阶段接入；公开内容在审核和举报能力完成后开放。"
      />
    </>
  );
}
