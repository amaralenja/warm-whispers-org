import { createFileRoute } from "@tanstack/react-router";
import { UtmGeneratorPage } from "./ht-analytics";

export const Route = createFileRoute("/_authenticated/ht-utm")({
  component: UtmGeneratorPage,
});
