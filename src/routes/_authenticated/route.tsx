import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Check if password reset is required
    const isResetRequired = data.user.user_metadata?.password_reset_required === true;
    if (isResetRequired && location.pathname !== "/reset-password") {
      throw redirect({ to: "/reset-password" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
