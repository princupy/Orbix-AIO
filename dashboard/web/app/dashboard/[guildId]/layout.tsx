import { GuildShell } from "@/components/dashboard/GuildShell";

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { guildId: string };
}) {
  return <GuildShell guildId={params.guildId}>{children}</GuildShell>;
}
