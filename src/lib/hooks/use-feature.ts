import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEFAULTS: Record<string, boolean> = {
  smart_import: true,
  ai_assist: true,
  campaigns_bulk: true,
  whatsapp_api: false,
  marketplace: false,
  white_label: false,
  public_api: false,
};

export type FeatureKey = keyof typeof DEFAULTS | string;

export function useFeatures(companyId?: string | null) {
  return useQuery({
    queryKey: ["company-features", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_features")
        .select("feature,enabled,config")
        .eq("company_id", companyId!);
      if (error) throw error;
      const map: Record<string, { enabled: boolean; config: unknown }> = {};
      for (const r of data ?? []) {
        map[r.feature] = { enabled: r.enabled, config: r.config };
      }
      return map;
    },
  });
}

export function useFeature(companyId: string | null | undefined, feature: FeatureKey) {
  const q = useFeatures(companyId);
  const override = q.data?.[feature];
  const enabled = override ? override.enabled : (DEFAULTS[feature] ?? false);
  return { enabled, loading: q.isLoading };
}
