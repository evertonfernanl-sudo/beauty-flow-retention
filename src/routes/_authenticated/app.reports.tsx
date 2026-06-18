import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/reports")({
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
});
