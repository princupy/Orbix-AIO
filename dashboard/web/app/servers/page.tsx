"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ServerCrash } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { GlassCard } from "@/components/glass/GlassCard";
import { guildIconUrl, initials } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { useSession } from "@/components/providers/SessionProvider";

interface GuildEntry {
  id: string;
  name: string;
  icon: string | null;
  role: Role;
}

export default function ServersPage() {
  const router = useRouter();
  const { user, logout } = useSession();
  const [guilds, setGuilds] = useState<GuildEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }

    api<{ guilds: GuildEntry[] }>("/api/guilds")
      .then((data) => setGuilds(data.guilds))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/");
        else setError(err?.message || "Failed to load servers.");
      });
  }, [router]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Your servers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Servers where you and Orbix both live and you can manage.
          </p>
        </div>
        {user ? (
          <button
            onClick={() => void logout()}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Log out
          </button>
        ) : null}
      </div>

      {error ? (
        <GlassCard className="mt-8 text-center text-muted-foreground">
          {error}
        </GlassCard>
      ) : null}

      {!error && guilds === null ? (
        <div className="mt-10 grid place-items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      ) : null}

      {guilds && guilds.length === 0 ? (
        <GlassCard className="mt-8 flex flex-col items-center gap-3 py-12 text-center">
          <ServerCrash className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No manageable servers found</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Invite Orbix to a server where you have Manage Server or moderation
            permissions, then refresh.
          </p>
        </GlassCard>
      ) : null}

      {guilds && guilds.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guilds.map((guild, index) => {
            const icon = guildIconUrl(guild.id, guild.icon, 64);
            return (
              <motion.div
                key={guild.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.04 }}
              >
                <Link href={`/dashboard/${guild.id}`}>
                  <GlassCard className="group flex items-center gap-4 transition-transform hover:-translate-y-0.5 hover:shadow-glow">
                    {icon ? (
                      <Image
                        src={icon}
                        alt={guild.name}
                        width={52}
                        height={52}
                        className="h-13 w-13 rounded-xl border border-white/10"
                        style={{ height: 52, width: 52 }}
                      />
                    ) : (
                      <div
                        className="grid place-items-center rounded-xl bg-accent-gradient font-bold"
                        style={{ height: 52, width: 52 }}
                      >
                        {initials(guild.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{guild.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {ROLE_LABELS[guild.role]}
                      </span>
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
