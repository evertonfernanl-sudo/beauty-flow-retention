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
    vertical: "BEAUTY" | "SALES" | "GYM" | "SERVICE" | "FINANCE";
    whatsapp: string | null;
    whatsapp_template: string | null;
    email: string | null;
    slug: string | null;
  } | null;
  role: "owner" | "admin" | "employee" | null;
  permissions: Record<string, boolean> | null;
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
      let permissions: CurrentProfile["permissions"] = null;

      if (profile?.company_id) {
        const { data: companyRow } = await supabase
          .from("companies")
          .select(
            "id, name, plan, onboarding_completed, vertical, whatsapp, whatsapp_template, email, slug",
          )
          .eq("id", profile.company_id)
          .maybeSingle();
        company = (companyRow as CurrentProfile["company"]) ?? null;

        let roleRowRes = await supabase
          .from("user_roles")
          .select("role, permissions")
          .eq("user_id", user.id)
          .eq("company_id", profile.company_id)
          .order("role", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (roleRowRes.error) {
          roleRowRes = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("company_id", profile.company_id)
            .order("role", { ascending: true })
            .limit(1)
            .maybeSingle();
        }

        const roleRow = roleRowRes.data;
        role = (roleRow?.role as CurrentProfile["role"]) ?? null;
        permissions = ((roleRow as any)?.permissions as CurrentProfile["permissions"]) ?? null;

        // Force 'owner' role if user's email matches the company's email
        if (companyRow?.email && user.email?.toLowerCase() === companyRow.email.toLowerCase()) {
          role = "owner";
        }
      }

      return {
        userId: user.id,
        email: user.email ?? "",
        profile: profile ?? null,
        company,
        role,
        permissions,
      };
    },
    staleTime: 30_000,
  });
}
