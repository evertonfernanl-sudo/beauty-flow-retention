import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/services")({
  beforeLoad: () => {
    throw redirect({ to: "/app/settings", search: { tab: "services" } });
  },
});
