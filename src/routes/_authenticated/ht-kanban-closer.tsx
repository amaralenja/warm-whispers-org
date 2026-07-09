import { createFileRoute } from "@tanstack/react-router";
import { HTAnalytics } from "./ht-analytics";

export const Route = createFileRoute("/_authenticated/ht-kanban-closer")({
  component: () => <HTAnalytics initialTab="closer" />,
});
