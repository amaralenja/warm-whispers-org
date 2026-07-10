import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/pv24h-analytics")({
  head: () => ({
    meta: [{ title: "Analytics PV24H" }],
  }),
  component: PV24HAnalyticsPage,
});

function PV24HAnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-accent" />
        <h1 className="text-2xl font-semibold">Analytics PV24H</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Operação PV24H</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Em breve: métricas e indicadores da operação PV24H.
        </CardContent>
      </Card>
    </div>
  );
}
