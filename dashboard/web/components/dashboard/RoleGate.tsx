"use client";

import { useGuild } from "./GuildShell";
import { GlassCard } from "@/components/glass/GlassCard";
import type { Role } from "@/lib/rbac";

const RANK: Record<Role, number> = { viewer: 1, moderator: 2, admin: 3 };

export function RoleGate({
  min,
  children,
}: {
  min: Role;
  children: React.ReactNode;
}) {
  const guild = useGuild();

  if (RANK[guild.role] < RANK[min]) {
    return (
      <div className="animate-fade-in">
        <GlassCard className="py-12 text-center text-muted-foreground">
          You don&apos;t have access to this section.
        </GlassCard>
      </div>
    );
  }

  return <>{children}</>;
}
