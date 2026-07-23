import type { KitchenDetail } from "@jiayan/contracts";
import { useDidShow } from "@tarojs/taro";
import { useCallback, useState } from "react";

import {
  ensureSignedIn,
  getKitchenDetail,
  getStoredCurrentKitchenId,
  storeCurrentKitchen,
} from "../../services/api-client";

export function useCurrentKitchen(): KitchenDetail | null {
  const [kitchen, setKitchen] = useState<KitchenDetail | null>(null);

  const load = useCallback(async () => {
    try {
      const current = await ensureSignedIn();
      const selected =
        current.kitchens.find(
          (item) => item.id === getStoredCurrentKitchenId(),
        ) ??
        current.currentKitchen ??
        current.kitchens[0];
      if (!selected) {
        setKitchen(null);
        return;
      }
      storeCurrentKitchen(selected.id);
      setKitchen(await getKitchenDetail(selected.id));
    } catch {
      setKitchen(null);
    }
  }, []);

  useDidShow(() => {
    void load();
  });

  return kitchen;
}
