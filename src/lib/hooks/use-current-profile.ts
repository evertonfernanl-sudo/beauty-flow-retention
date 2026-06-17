import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CurrentProfile = {
  userId: string;
  email: string;
  profile: {
    id: string;
    name: string;
    email: string;
    company_id: string | null;
    avatar_url: string | null;
  } | null;
  company: {
    id: string;
    name: string;
    plan: string;
    onboarding_completed: boolean;
    vertical: "BEAUTY" | "SALES" | "GYM";
    whatsapp: string | null;
    whatsapp_template: string | null;
  } | null;
  role: "owner" | "admin" | "employee" | null;
};

export function useCurrentProfile() {
  return useQuery<CurrentProfile | null>({
    queryKey: ["current-profile"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, email, company_id, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      let company = null;
      let role: CurrentProfile["role"] = null;

      if (profile?.company_id) {
        const { data: companyRow } = await supabase
          .from("companies")
          .select("id, name, plan, onboarding_completed, vertical, whatsapp, whatsapp_template")
          .eq("id", profile.company_id)
          .maybeSingle();
        company = (companyRow as CurrentProfile["company"]) ?? null;

        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("company_id", profile.company_id)
          .order("role", { ascending: true })
          .limit(1)
          .maybeSingle();
        role = (roleRow?.role as CurrentProfile["role"]) ?? null;
      }

      return {
        userId: user.id,
        email: user.email ?? "",
        profile: profile ?? null,
        company,
        role,
      };
    },
    staleTime: 30_000,
  });
}
