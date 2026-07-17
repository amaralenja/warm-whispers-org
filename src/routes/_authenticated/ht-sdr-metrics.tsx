import { createFileRoute } from "@tanstack/react-router";
import { HTAnalytics } from "./ht-analytics";

export const Route = createFileRoute("/_authenticated/ht-sdr-metrics")({
  component: () => <HTAnalytics initialTab="sdr-metrics" />,
});
