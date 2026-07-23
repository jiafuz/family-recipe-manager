import { FoundationCard } from "../../components/foundation-card";
import { KitchenToolbar } from "../../components/kitchen-toolbar";

export default function ProfilePage(): JSX.Element {
  return (
    <>
      <KitchenToolbar />
      <FoundationCard
        title="个人中心工程已就绪"
        description="这里将逐步接入制作回忆、营养分析、隐私设置、数据导出和账号注销。"
      />
    </>
  );
}
