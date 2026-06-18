import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/import")({
  beforeLoad: () => {
    throw redirect({ to: "/app/sie" });
  },
});
