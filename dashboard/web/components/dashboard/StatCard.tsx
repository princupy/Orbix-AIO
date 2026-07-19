"use client";

import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/glass/GlassCard";
import { AnimatedCounter } from "@/components/glass/AnimatedCounter";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "from-indigo-500/25 to-fuchsia-500/25",
  live,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: string;
  live?: boolean;
}) {
  return (
    <GlassCard className="relative overflow-hidden">
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-2xl",
          accent,
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5 text-white/60" />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <AnimatedCounter
          value={value}
          className="text-3xl font-bold tracking-tight"
        />
        {live ? (
          <span className="mb-1 flex items-center gap-1 text-xs text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            live
          </span>
        ) : null}
      </div>
    </GlassCard>
  );
}
