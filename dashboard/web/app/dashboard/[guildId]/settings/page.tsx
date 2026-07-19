"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Gamepad2,
  Image as ImageIcon,
  Loader2,
  Mic,
  Music,
  PartyPopper,
  Save,
  ScrollText,
  Shield,
  ShieldAlert,
  Ticket,
  TrendingUp,
  UserPlus,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useGuild } from "@/components/dashboard/GuildShell";
import { RoleGate } from "@/components/dashboard/RoleGate";
import { GlassCard } from "@/components/glass/GlassCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ModuleState {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface SettingsResponse {
  prefix: string;
  modules: ModuleState[];
  configured: boolean;
}

type Feedback = { type: "success" | "error"; message: string } | null;

const PREFIX_MAX_LENGTH = 8;

const MODULE_ICONS: Record<string, LucideIcon> = {
  moderation: Shield,
  automod: ShieldAlert,
  leveling: TrendingUp,
  tickets: Ticket,
  music: Music,
  fun: Gamepad2,
  voice: Volume2,
  media: ImageIcon,
  autoroles: UserPlus,
  welcome: PartyPopper,
  logs: ScrollText,
};

function SettingsPanel() {
  const guild = useGuild();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefixInput, setPrefixInput] = useState("");
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let active = true;
    setLoadError(null);

    api<SettingsResponse>(`/api/guilds/${guild.id}/settings`)
      .then((res) => {
        if (!active) return;
        setData(res);
        setPrefixInput(res.prefix);
      })
      .catch((err) => {
        if (active) setLoadError(err?.message || "Failed to load settings.");
      });

    return () => {
      active = false;
    };
  }, [guild.id]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const trimmedPrefix = prefixInput.trim();
  const prefixValid =
    trimmedPrefix.length >= 1 &&
    trimmedPrefix.length <= PREFIX_MAX_LENGTH &&
    !/\s/.test(trimmedPrefix);
  const prefixDirty = data ? trimmedPrefix !== data.prefix : false;

  const savePrefix = useCallback(async () => {
    if (!prefixValid || !prefixDirty || savingPrefix) return;
    setSavingPrefix(true);

    try {
      const res = await api<{ prefix: string }>(
        `/api/guilds/${guild.id}/settings/prefix`,
        { method: "PUT", body: JSON.stringify({ prefix: trimmedPrefix }) },
      );
      setData((prev) => (prev ? { ...prev, prefix: res.prefix } : prev));
      setPrefixInput(res.prefix);
      setFeedback({ type: "success", message: `Prefix updated to ${res.prefix}` });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 400
          ? `Invalid prefix. Use 1-${PREFIX_MAX_LENGTH} characters with no spaces.`
          : "Could not update the prefix. Please try again.";
      setFeedback({ type: "error", message });
    } finally {
      setSavingPrefix(false);
    }
  }, [guild.id, prefixValid, prefixDirty, savingPrefix, trimmedPrefix]);

  const toggleModule = useCallback(
    async (mod: ModuleState) => {
      if (savingKey) return;
      const nextEnabled = !mod.enabled;
      setSavingKey(mod.key);
      setData((prev) =>
        prev
          ? {
              ...prev,
              modules: prev.modules.map((m) =>
                m.key === mod.key ? { ...m, enabled: nextEnabled } : m,
              ),
            }
          : prev,
      );

      try {
        const res = await api<{ modules: ModuleState[] }>(
          `/api/guilds/${guild.id}/settings/modules`,
          {
            method: "PUT",
            body: JSON.stringify({ key: mod.key, enabled: nextEnabled }),
          },
        );
        setData((prev) => (prev ? { ...prev, modules: res.modules } : prev));
        setFeedback({
          type: "success",
          message: `${mod.label} ${nextEnabled ? "enabled" : "disabled"}.`,
        });
      } catch {
        setData((prev) =>
          prev
            ? {
                ...prev,
                modules: prev.modules.map((m) =>
                  m.key === mod.key ? { ...m, enabled: mod.enabled } : m,
                ),
              }
            : prev,
        );
        setFeedback({ type: "error", message: `Could not update ${mod.label}.` });
      } finally {
        setSavingKey(null);
      }
    },
    [guild.id, savingKey],
  );

  if (loadError) {
    return (
      <GlassCard className="text-sm text-muted-foreground">{loadError}</GlassCard>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm animate-fade-in",
            feedback.type === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/30 bg-red-400/10 text-red-200",
          )}
        >
          {feedback.type === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      <GlassCard className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Command Prefix</h2>
          <p className="text-sm text-muted-foreground">
            The character(s) members type before a command, for example{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
              {data.prefix}help
            </code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={prefixInput}
            onChange={(event) => setPrefixInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") savePrefix();
            }}
            maxLength={PREFIX_MAX_LENGTH}
            spellCheck={false}
            placeholder="LR!"
            className="h-10 w-40 rounded-lg border border-white/15 bg-white/[0.03] px-3 font-mono text-sm outline-none transition-colors focus:border-white/30 focus:bg-white/[0.06]"
          />
          <Button
            variant="gradient"
            onClick={savePrefix}
            disabled={!prefixValid || !prefixDirty || savingPrefix}
          >
            {savingPrefix ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
          {!prefixValid && trimmedPrefix.length > 0 && (
            <span className="text-xs text-red-300">
              1-{PREFIX_MAX_LENGTH} characters, no spaces.
            </span>
          )}
        </div>
      </GlassCard>

      <GlassCard className="space-y-0 p-0">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">Modules</h2>
          <p className="text-sm text-muted-foreground">
            Turn features on or off. Changes reach the bot instantly.
          </p>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {data.modules.map((mod) => {
            const Icon = MODULE_ICONS[mod.key] ?? Shield;
            const isSaving = savingKey === mod.key;

            return (
              <div key={mod.key} className="flex items-center gap-4 p-4 sm:px-5">
                <div
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 transition-colors",
                    mod.enabled
                      ? "bg-accent-gradient text-white"
                      : "bg-white/[0.03] text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{mod.label}</span>
                    {isSaving && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {mod.description}
                  </p>
                </div>
                <Switch
                  checked={mod.enabled}
                  onCheckedChange={() => toggleModule(mod)}
                  disabled={savingKey !== null}
                  aria-label={`Toggle ${mod.label}`}
                />
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure the bot for this server. Admin only.
        </p>
      </div>
      <RoleGate min="admin">
        <SettingsPanel />
      </RoleGate>
    </div>
  );
}
