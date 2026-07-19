"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Ban,
  Check,
  Gavel,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { useGuild } from "@/components/dashboard/GuildShell";
import { RoleGate } from "@/components/dashboard/RoleGate";
import { StatCard } from "@/components/dashboard/StatCard";
import { GlassCard } from "@/components/glass/GlassCard";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/rbac";

interface ModCase {
  id: number | null;
  type: string;
  targetId: string | null;
  targetTag: string | null;
  moderatorId: string | null;
  moderatorTag: string | null;
  reason: string | null;
  durationMs?: number | null;
  expiresAt?: number | null;
  active: boolean;
  at: number | null;
  uid: string;
}

interface Stats {
  total: number;
  ban: number;
  kick: number;
  mute: number;
  activeBans: number;
  activeMutes: number;
}

type Feedback = { type: "success" | "error"; message: string } | null;

const RANK: Record<Role, number> = { viewer: 1, moderator: 2, admin: 3 };
const MAX_ROWS = 200;

const TYPE_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  ban: { label: "Ban", icon: Ban, color: "bg-red-500/15 text-red-300" },
  unban: { label: "Unban", icon: ShieldCheck, color: "bg-emerald-500/15 text-emerald-300" },
  kick: { label: "Kick", icon: UserMinus, color: "bg-orange-500/15 text-orange-300" },
  mute: { label: "Mute", icon: MicOff, color: "bg-amber-500/15 text-amber-300" },
  unmute: { label: "Unmute", icon: Mic, color: "bg-sky-500/15 text-sky-300" },
};
const FALLBACK_META = { label: "Case", icon: Shield, color: "bg-white/10 text-slate-300" };

function metaFor(type: string) {
  return TYPE_META[type] || FALLBACK_META;
}

function formatRelative(at: number | null) {
  if (!at) return "";
  const diff = Date.now() - at;
  if (diff < 5_000) return "now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

let liveCounter = 0;

function revokeFor(entry: ModCase, role: Role): { action: string; label: string } | null {
  if (!entry.active) return null;
  if (entry.type === "mute" && RANK[role] >= RANK.moderator) return { action: "unmute", label: "Unmute" };
  if (entry.type === "ban" && role === "admin") return { action: "unban", label: "Unban" };
  return null;
}

function ModerationPanel() {
  const guild = useGuild();
  const role = guild.role;

  const [cases, setCases] = useState<ModCase[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [types, setTypes] = useState<string[]>(Object.keys(TYPE_META));
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const filterRef = useRef({ typeFilter, activeOnly, search });
  useEffect(() => {
    filterRef.current = { typeFilter, activeOnly, search };
  }, [typeFilter, activeOnly, search]);

  // Debounce search input.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Auto-dismiss feedback.
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const loadStats = useCallback(() => {
    api<Stats>(`/api/guilds/${guild.id}/moderation/stats`)
      .then(setStats)
      .catch(() => {});
  }, [guild.id]);

  const loadCases = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "50" });
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (activeOnly) params.set("active", "true");
    if (search) params.set("search", search);

    return api<{ cases: Omit<ModCase, "uid">[]; types: string[] }>(
      `/api/guilds/${guild.id}/moderation/cases?${params.toString()}`,
    )
      .then((data) => {
        setCases((data.cases || []).map((entry) => ({ ...entry, uid: `db-${entry.id}` })));
        if (data.types?.length) setTypes(data.types);
      })
      .catch((err) => setError(err?.message || "Failed to load cases."))
      .finally(() => setLoading(false));
  }, [guild.id, typeFilter, activeOnly, search]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // Live case stream.
  useEffect(() => {
    const socket = getSocket();

    const subscribe = () => socket.emit("subscribe", guild.id);

    const onModAction = (payload: Omit<ModCase, "uid"> & { guildId?: string }) => {
      if (payload?.guildId !== guild.id) return;
      const { typeFilter: t, activeOnly: a, search: s } = filterRef.current;
      if (s) return; // keep search results stable
      if (t !== "all" && payload.type !== t) return;
      if (a && !payload.active) return;

      liveCounter += 1;
      const entry: ModCase = { ...payload, uid: `live-${liveCounter}` };
      setCases((prev) => [entry, ...prev].slice(0, MAX_ROWS));
      loadStats();
    };

    socket.on("connect", subscribe);
    socket.on("modAction", onModAction);
    if (socket.connected) subscribe();

    return () => {
      socket.off("connect", subscribe);
      socket.off("modAction", onModAction);
    };
  }, [guild.id, loadStats]);

  const revokeCase = useCallback(
    async (entry: ModCase) => {
      if (entry.id == null || revoking != null) return;
      setRevoking(entry.id);

      try {
        const res = await api<{ ok: boolean; action: string }>(
          `/api/guilds/${guild.id}/moderation/cases/${entry.id}/revoke`,
          { method: "POST" },
        );
        setCases((prev) =>
          prev.map((item) => (item.id === entry.id ? { ...item, active: false } : item)),
        );
        setFeedback({ type: "success", message: `${res.action === "unban" ? "Unbanned" : "Unmuted"} ${entry.targetTag || entry.targetId || "user"}.` });
        loadStats();
      } catch (err) {
        let message = "Action failed. Try again.";
        if (err instanceof ApiError) {
          if (err.status === 503) message = "Bot is offline — action could not be sent.";
          else if (err.status === 504) message = "The bot did not respond in time.";
          else if (err.status === 403) message = "You don't have permission for that action.";
          else if (err.status === 502) message = "The bot could not complete the action.";
        }
        setFeedback({ type: "error", message });
      } finally {
        setRevoking(null);
      }
    },
    [guild.id, revoking, loadStats],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total cases" value={stats?.total ?? 0} icon={Gavel} />
        <StatCard label="Bans" value={stats?.ban ?? 0} icon={Ban} accent="from-red-500/25 to-orange-500/25" />
        <StatCard label="Kicks" value={stats?.kick ?? 0} icon={UserMinus} accent="from-orange-500/25 to-amber-500/25" />
        <StatCard label="Mutes" value={stats?.mute ?? 0} icon={MicOff} accent="from-amber-500/25 to-yellow-500/25" />
      </div>

      {feedback && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm animate-fade-in",
            feedback.type === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/30 bg-red-400/10 text-red-200",
          )}
        >
          {feedback.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {feedback.message}
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search user, moderator, reason, or ID…"
            className="h-10 w-full rounded-lg border border-white/15 bg-white/[0.03] pl-9 pr-3 text-sm outline-none transition-colors focus:border-white/30 focus:bg-white/[0.06]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="All" active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
          {types.map((type) => (
            <FilterChip
              key={type}
              label={metaFor(type).label}
              active={typeFilter === type}
              onClick={() => setTypeFilter(type)}
            />
          ))}
          <FilterChip
            label="Active only"
            active={activeOnly}
            onClick={() => setActiveOnly((value) => !value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cases…
        </div>
      ) : error ? (
        <GlassCard className="text-sm text-muted-foreground">{error}</GlassCard>
      ) : cases.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-muted-foreground">
          No moderation cases found.
        </GlassCard>
      ) : (
        <GlassCard className="space-y-0 p-0">
          <div className="divide-y divide-white/[0.06]">
            {cases.map((entry) => {
              const meta = metaFor(entry.type);
              const Icon = meta.icon;
              const revoke = revokeFor(entry, role);
              const isRevoking = revoking === entry.id;

              return (
                <div key={entry.uid} className="flex items-start gap-3 p-4 sm:px-5">
                  <div className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg", meta.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{entry.targetTag || "Unknown user"}</span>
                      {entry.targetId && (
                        <span className="font-mono text-[11px] text-muted-foreground/70">{entry.targetId}</span>
                      )}
                      {entry.active && (entry.type === "ban" || entry.type === "mute") && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {entry.reason || "No reason provided"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground/70">
                      {meta.label}
                      {entry.moderatorTag ? ` · by ${entry.moderatorTag}` : ""} · {formatRelative(entry.at)}
                    </p>
                  </div>
                  {revoke && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeCase(entry)}
                      disabled={isRevoking || revoking != null}
                    >
                      {isRevoking ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      {revoke.label}
                    </Button>
                  )}
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

export default function ModerationPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Moderation</h1>
        <p className="text-sm text-muted-foreground">
          Case log for bans, kicks and mutes. Search, filter, and revoke.
        </p>
      </div>
      <RoleGate min="moderator">
        <ModerationPanel />
      </RoleGate>
    </div>
  );
}
