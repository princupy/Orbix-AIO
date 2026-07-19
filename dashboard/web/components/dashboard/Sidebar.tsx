"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, ChevronLeft } from "lucide-react";
import { navForRole, ROLE_LABELS, type Role } from "@/lib/rbac";
import { cn, guildIconUrl, initials } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";

interface SidebarGuild {
  id: string;
  name: string;
  icon: string | null;
  role: Role;
}

function GuildBadge({ guild }: { guild: SidebarGuild }) {
  const icon = guildIconUrl(guild.id, guild.icon, 64);

  return (
    <div className="flex items-center gap-3">
      {icon ? (
        <Image
          src={icon}
          alt={guild.name}
          width={44}
          height={44}
          className="h-11 w-11 rounded-xl border border-white/10"
        />
      ) : (
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-gradient text-sm font-bold">
          {initials(guild.name)}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{guild.name}</p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {ROLE_LABELS[guild.role]}
        </span>
      </div>
    </div>
  );
}

export function Sidebar({ guild }: { guild: SidebarGuild }) {
  const pathname = usePathname();
  const { user, logout } = useSession();
  const items = navForRole(guild.role);
  const base = `/dashboard/${guild.id}`;

  const isActive = (segment: string) =>
    segment === "" ? pathname === base : pathname.startsWith(`${base}${segment}`);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col p-4 md:flex">
        <Link
          href="/servers"
          className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All servers
        </Link>
        <div className="py-3">
          <GuildBadge guild={guild} />
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.segment);
            return (
              <Link
                key={item.key}
                href={`${base}${item.segment}`}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-accent-gradient text-white shadow-glow-sm"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.04] p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.tag || "—"}</p>
            <p className="text-xs text-muted-foreground">Signed in</p>
          </div>
          <button
            onClick={() => void logout()}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-20 flex flex-col gap-3 p-3 md:hidden">
        <div className="flex items-center justify-between">
          <GuildBadge guild={guild} />
          <button
            onClick={() => void logout()}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-white/10"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {items.map((item) => {
            const active = isActive(item.segment);
            return (
              <Link
                key={item.key}
                href={`${base}${item.segment}`}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent-gradient text-white"
                    : "text-muted-foreground hover:bg-white/[0.06]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
