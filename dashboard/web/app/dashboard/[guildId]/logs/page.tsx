"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Ban,
  LogOut,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  UserMinus,
  UserPlus,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useGuild } from "@/components/dashboard/GuildShell";
import { RoleGate } from "@/components/dashboard/RoleGate";
import { GlassCard } from "@/components/glass/GlassCard";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";

interface LogEntry {
  id?: number;
  type: string;
  title: string;
  description: string;
  targetId?: string | null;
  targetTag?: string | null;
  moderatorId?: string | null;
  moderatorTag?: string | null;
  at: number | null;
  uid: string;
}

const TYPE_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  message: { label: "Message", icon: MessageSquare, color: "bg-indigo-500/15 text-indigo-300" },
  ban: { label: "Ban", icon: Ban, color: "bg-red-500/15 text-red-300" },
  kick: { label: "Kick", icon: UserMinus, color: "bg-orange-500/15 text-orange-300" },
  mute: { label: "Mute", icon: MicOff, color: "bg-amber-500/15 text-amber-300" },
  unmute: { label: "Unmute", icon: Mic, color: "bg-emerald-500/15 text-emerald-300" },
  join: { label: "Join", icon: UserPlus, color: "bg-emerald-500/15 text-emerald-300" },
  leave: { label: "Leave", icon: LogOut, color: "bg-rose-500/15 text-rose-300" },
  voice: { label: "Voice", icon: Volume2, color: "bg-purple-500/15 text-purple-300" },
};
const FALLBACK_META = { label: "Event", icon: Activity, color: "bg-white/10 text-slate-300" };

const MAX_ENTRIES = 200;

function metaFor(type: string) {
  return TYPE_META[type] || FALLBACK_META;
}

function formatRelative(at: number | null) {
  if (!at) return "";
  const diff = Date.now() - at;
  if (diff < 5_000) return "now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

let liveCounter = 0;

function LogsFeed() {
  const guild = useGuild();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [types, setTypes] = useState<string[]>(Object.keys(TYPE_META));
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [, setTick] = useState(0);

  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // Load history whenever the filter changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const query = filter === "all" ? "" : `&type=${filter}`;

    api<{ logs: Omit<LogEntry, "uid">[]; types: string[] }>(
      `/api/guilds/${guild.id}/logs?limit=50${query}`,
    )
      .then((data) => {
        if (!active) return;
        setLogs((data.logs || []).map((entry) => ({ ...entry, uid: `db-${entry.id}` })));
        if (data.types?.length) setTypes(data.types);
      })
      .catch((err) => {
        if (active) setError(err?.message || "Failed to load logs.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guild.id, filter]);

  // Live stream.
  useEffect(() => {
    const socket = getSocket();

    const subscribe = () => {
      setConnected(true);
      socket.emit("subscribe", guild.id);
    };

    const onLog = (payload: Omit<LogEntry, "uid"> & { guildId?: string }) => {
      if (payload?.guildId !== guild.id) return;
      const current = filterRef.current;
      if (current !== "all" && payload.type !== current) return;

      liveCounter += 1;
      const entry: LogEntry = { ...payload, uid: `live-${liveCounter}` };
      setLogs((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
    };

    socket.on("connect", subscribe);
    socket.on("disconnect", () => setConnected(false));
    socket.on("logEvent", onLog);

    if (socket.connected) subscribe();

    return () => {
      socket.off("connect", subscribe);
      socket.off("logEvent", onLog);
    };
  }, [guild.id]);

  // Keep relative timestamps fresh.
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const selectFilter = useCallback((value: string) => setFilter(value), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="All" active={filter === "all"} onClick={() => selectFilter("all")} />
        {types.map((type) => (
          <FilterChip
            key={type}
            label={metaFor(type).label}
            active={filter === type}
            onClick={() => selectFilter(type)}
          />
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "animate-pulse bg-emerald-400" : "bg-white/30",
            )}
          />
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading logs…
        </div>
      ) : error ? (
        <GlassCard className="text-sm text-muted-foreground">{error}</GlassCard>
      ) : logs.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-muted-foreground">
          No activity recorded yet. Events appear here live as they happen.
        </GlassCard>
      ) : (
        <GlassCard className="space-y-0 p-0">
          <div className="divide-y divide-white/[0.06]">
            {logs.map((entry) => {
              const meta = metaFor(entry.type);
              const Icon = meta.icon;
              return (
                <div key={entry.uid} className="flex items-start gap-3 p-3 sm:px-5 sm:py-4">
                  <div className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg", meta.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.title}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                        {meta.label}
                      </span>
                    </div>
                    {entry.description && (
                      <p className="truncate text-sm text-muted-foreground">{entry.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {formatRelative(entry.at)}
                  </span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-accent-gradient text-white shadow-glow-sm"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08]",
      )}
    >
      {label}
    </button>
  );
}

export default function LogsPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Live server activity feed. Newest first.
        </p>
      </div>
      <RoleGate min="moderator">
        <LogsFeed />
      </RoleGate>
    </div>
  );
}
