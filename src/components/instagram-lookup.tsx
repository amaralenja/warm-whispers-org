import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Instagram, Loader2, BadgeCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchInstagramProfile } from "@/lib/instagram.functions";

type Profile = {
  username: string;
  full_name: string | null;
  biography: string | null;
  followers: number;
  following: number;
  posts_count: number;
  is_verified: boolean;
  profile_pic_url: string | null;
};

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function InstagramLookup({ onFetched }: { onFetched?: (p: Profile) => void }) {
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const fetchFn = useServerFn(fetchInstagramProfile);

  const m = useMutation({
    mutationFn: async (v: string) => fetchFn({ data: { input: v } }),
    onSuccess: (p: any) => {
      setProfile(p);
      onFetched?.(p);
      toast.success(`@${p.username} carregado!`);
    },
    onError: (e: any) => toast.error(e?.message || "Falhou"),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Instagram className="h-4 w-4 text-pink-500" />
        <h3 className="text-sm font-semibold">Buscar perfil do Instagram</h3>
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && input && m.mutate(input)}
          placeholder="@usuario ou https://instagram.com/usuario"
          disabled={m.isPending}
        />
        <Button onClick={() => input && m.mutate(input)} disabled={m.isPending || !input}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1">Buscar</span>
        </Button>
      </div>

      {profile && (
        <div className="flex gap-4 items-start pt-2 border-t border-border">
          {profile.profile_pic_url ? (
            <img
              src={profile.profile_pic_url}
              alt={profile.username}
              className="h-20 w-20 rounded-full object-cover border-2 border-pink-500/50"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
              <Instagram className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">@{profile.username}</span>
              {profile.is_verified && <BadgeCheck className="h-4 w-4 text-blue-500" />}
            </div>
            {profile.full_name && (
              <div className="text-sm text-muted-foreground">{profile.full_name}</div>
            )}
            {profile.biography && (
              <p className="text-xs mt-1 line-clamp-2">{profile.biography}</p>
            )}
            <div className="flex gap-4 mt-2 text-xs">
              <div><b>{fmt(profile.posts_count)}</b> <span className="text-muted-foreground">posts</span></div>
              <div><b>{fmt(profile.followers)}</b> <span className="text-muted-foreground">seguidores</span></div>
              <div><b>{fmt(profile.following)}</b> <span className="text-muted-foreground">seguindo</span></div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
