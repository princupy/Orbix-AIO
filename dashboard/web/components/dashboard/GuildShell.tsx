"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Role } from "@/lib/rbac";
import { Sidebar } from "./Sidebar";

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
  role: Role;
}

const GuildContext = createContext<GuildInfo | undefined>(undefined);

export function useGuild() {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error("useGuild must be used within GuildShell");
  return ctx;
}

export function GuildShell({
  guildId,
  children,
}: {
  guildId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [guild, setGuild] = useState<GuildInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }

    let active = true;

    api<{ guild: Omit<GuildInfo, "role">; role: Role }>(`/api/guilds/${guildId}`)
      .then((data) => {
        if (active) setGuild({ ...data.guild, role: data.role });
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/");
        } else if (err instanceof ApiError && err.status === 403) {
          router.replace("/servers");
        } else {
          setError(err?.message || "Failed to load this server.");
        }
      });

    return () => {
      active = false;
    };
  }, [guildId, router]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  return (
    <GuildContext.Provider value={guild}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar guild={guild} />
        <main className="flex-1 overflow-x-hidden p-5 sm:p-8">{children}</main>
      </div>
    </GuildContext.Provider>
  );
}
