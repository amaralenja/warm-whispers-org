import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { DashboardConfigProvider } from "@/lib/dashboard-config";
import { AudioPlayerProvider, FloatingAudioMiniPlayer } from "@/lib/audio-player-context";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return { user: data.user };
    // Permite vendedor logado via vendor_session (localStorage)
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("vendor_session");
      if (raw) {
        try {
          const s = JSON.parse(raw);
          if (s?.id) return { user: null, vendor: s };
        } catch { /* noop */ }
      }
    }
    throw redirect({ to: "/auth" });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <WorkspaceProvider>
      <DashboardConfigProvider>
        <AudioPlayerProvider>
          <SidebarProvider>
            <div className="flex min-h-screen w-full bg-background">
              <AppSidebar />
              <div className="flex-1 flex flex-col min-w-0">
                <header className="flex h-14 items-center gap-3 border-b border-border px-3 md:px-5">
                  <SidebarTrigger />
                </header>
                <div className="flex-1">
                  <Outlet />
                </div>
              </div>
            </div>
            <FloatingAudioMiniPlayer />
          </SidebarProvider>
        </AudioPlayerProvider>
      </DashboardConfigProvider>
    </WorkspaceProvider>
  );
}
