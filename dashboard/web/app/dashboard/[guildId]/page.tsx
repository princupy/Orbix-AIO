"use client";

import { useEffect, useState } from "react";
import { BarChart3, MessageSquare, Terminal, Users } from "lucide-react";
import { useGuild } from "@/components/dashboard/GuildShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { GlassCard } from "@/components/glass/GlassCard";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface Overview {
  messagesToday: number;
  commandsToday: number;
  messages7d: number;
  commands7d: number;
}

const OVERVIEW_POLL_MS = 30_000;

export default function OverviewPage() {
  const guild = useGuild();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [connected, setConnected] = useState(false);

  // Live member count over the socket bridge.
  useEffect(() => {
    const socket = getSocket();

    const subscribe = () => {
      setConnected(true);
      socket.emit("subscribe", guild.id);
    };

    const onStats = (payload: { guildId: string; memberCount: number }) => {
      if (payload.guildId === guild.id) {
        setMemberCount(payload.memberCount);
      }
    };

    socket.on("connect", subscribe);
    socket.on("disconnect", () => setConnected(false));
    socket.on("guildStats", onStats);

    if (socket.connected) subscribe();

    return () => {
      socket.emit("unsubscribe", guild.id);
      socket.off("connect", subscribe);
      socket.off("guildStats", onStats);
    };
  }, [guild.id]);

  // Message / command counters from the DB (polled).
  useEffect(() => {
    let active = true;

    const load = () =>
      api<Overview>(`/api/guilds/${guild.id}/analytics/overview`)
        .then((data) => {
          if (active) setOverview(data);
        })
        .catch(() => {
          /* transient — keep last known values */
        });

    load();
    const timer = setInterval(load, OVERVIEW_POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [guild.id]);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Live snapshot of {guild.name}.{" "}
          {connected ? "Realtime connected." : "Connecting to realtime…"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Members"
          value={memberCount ?? 0}
          icon={Users}
          live={connected}
        />
        <StatCard
          label="Messages today"
          value={overview?.messagesToday ?? 0}
          icon={MessageSquare}
          accent="from-sky-500/25 to-indigo-500/25"
        />
        <StatCard
          label="Commands today"
          value={overview?.commandsToday ?? 0}
          icon={Terminal}
          accent="from-fuchsia-500/25 to-pink-500/25"
        />
        <StatCard
          label="Messages (7d)"
          value={overview?.messages7d ?? 0}
          icon={BarChart3}
          accent="from-emerald-500/25 to-teal-500/25"
        />
      </div>

      <GlassCard>
        <h2 className="font-semibold">Realtime + analytics are live</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Member count streams from the bot over WebSockets. Message and command
          counters update from recorded analytics. Open the Analytics tab for
          message activity, member growth, and command-usage charts.
        </p>
      </GlassCard>
    </div>
  );
}
