import { createFileRoute } from "@tanstack/react-router";
import { HTAnalytics } from "./ht-analytics";

export const Route = createFileRoute("/_authenticated/ht-kanban-sdr")({
  component: () => <HTAnalytics initialTab="kanban" />,
});
