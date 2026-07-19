"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, BarChart3, Loader2, TrendingUp, Users } from "lucide-react";
import { useGuild } from "@/components/dashboard/GuildShell";
import { GlassCard } from "@/components/glass/GlassCard";
import { api } from "@/lib/api";

interface MessagePoint {
  day: string;
  count: number;
}
interface MemberPoint {
  day: string;
  memberCount: number;
  onlineCount: number | null;
}
interface CommandTop {
  command: string;
  uses: number;
}

const BAR_COLORS = ["#818cf8", "#a78bfa", "#e879f9", "#f472b6", "#38bdf8", "#34d399", "#fbbf24", "#fb7185"];

const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact" });

function formatDay(value: string | number | undefined) {
  if (value == null) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

interface TipEntry {
  value?: number;
  name?: string;
  color?: string;
  fill?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TipEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number | undefined) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c14]/95 px-3 py-2 text-xs shadow-glow-sm backdrop-blur">
      <div className="mb-1 font-medium text-white/80">
        {labelFormatter ? labelFormatter(label) : label}
      </div>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-white/70">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: entry.color || entry.fill || "#818cf8" }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto font-semibold text-white">
            {numberFormat.format(Number(entry.value || 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

const AXIS_TICK = { fill: "rgba(255,255,255,0.45)", fontSize: 12 };
const GRID_STROKE = "rgba(255,255,255,0.06)";

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Users;
  isEmpty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Icon className="h-5 w-5 text-white/50" />
      </div>
      <div className="h-64 w-full">
        {isEmpty ? (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-white/10 px-6 text-center text-sm text-muted-foreground">
            {emptyText || "No data yet."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        )}
      </div>
    </GlassCard>
  );
}

export default function AnalyticsPage() {
  const guild = useGuild();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessagePoint[]>([]);
  const [members, setMembers] = useState<MemberPoint[]>([]);
  const [commandTop, setCommandTop] = useState<CommandTop[]>([]);
  const [commandSeries, setCommandSeries] = useState<MessagePoint[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      const [messagesData, membersData, commandsData] = await Promise.all([
        api<{ series: MessagePoint[] }>(`/api/guilds/${guild.id}/analytics/messages?days=14`),
        api<{ series: MemberPoint[] }>(`/api/guilds/${guild.id}/analytics/members?days=14`),
        api<{ top: CommandTop[]; series: MessagePoint[] }>(
          `/api/guilds/${guild.id}/analytics/commands?days=7&limit=8`,
        ),
      ]);

      if (!active) return;
      setMessages(messagesData.series || []);
      setMembers(membersData.series || []);
      setCommandTop(commandsData.top || []);
      setCommandSeries(commandsData.series || []);
    };

    load()
      .catch((err) => {
        if (active) setError(err?.message || "Failed to load analytics.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guild.id]);

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Last 14 days for {guild.name}.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in space-y-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <GlassCard className="text-sm text-muted-foreground">{error}</GlassCard>
      </div>
    );
  }

  const hasMessages = messages.some((point) => point.count > 0);
  const hasCommandSeries = commandSeries.some((point) => point.count > 0);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Last 14 days for {guild.name}.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Message Activity"
          subtitle="Messages per day"
          icon={Activity}
          isEmpty={!hasMessages}
          emptyText="No messages recorded yet. Data appears as members chat."
        >
          <AreaChart data={messages} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="day" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} allowDecimals={false} tickFormatter={(value) => compactFormat.format(Number(value))} />
            <Tooltip content={<ChartTooltip labelFormatter={formatDay} />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
            <Area type="monotone" dataKey="count" name="Messages" stroke="#818cf8" strokeWidth={2} fill="url(#fillMessages)" />
          </AreaChart>
        </ChartCard>

        <ChartCard
          title="Member Growth"
          subtitle="Total members per day"
          icon={Users}
          isEmpty={members.length === 0}
          emptyText="Member history builds up as the bot runs (snapshots every 30 min)."
        >
          <LineChart data={members} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="day" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} allowDecimals={false} domain={["auto", "auto"]} tickFormatter={(value) => compactFormat.format(Number(value))} />
            <Tooltip content={<ChartTooltip labelFormatter={formatDay} />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
            <Line type="monotone" dataKey="memberCount" name="Members" stroke="#e879f9" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ChartCard>

        <ChartCard
          title="Top Commands"
          subtitle="Most used in the last 7 days"
          icon={BarChart3}
          isEmpty={commandTop.length === 0}
          emptyText="No commands recorded yet. Usage appears as members run commands."
        >
          <BarChart data={commandTop} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="command" width={92} tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar dataKey="uses" name="Uses" radius={[0, 6, 6, 0]} barSize={18}>
              {commandTop.map((entry, index) => (
                <Cell key={entry.command} fill={BAR_COLORS[index % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Command Usage"
          subtitle="Commands run per day"
          icon={TrendingUp}
          isEmpty={!hasCommandSeries}
          emptyText="No command usage recorded yet."
        >
          <AreaChart data={commandSeries} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="fillCommands" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="day" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} allowDecimals={false} tickFormatter={(value) => compactFormat.format(Number(value))} />
            <Tooltip content={<ChartTooltip labelFormatter={formatDay} />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
            <Area type="monotone" dataKey="count" name="Commands" stroke="#38bdf8" strokeWidth={2} fill="url(#fillCommands)" />
          </AreaChart>
        </ChartCard>
      </div>
    </div>
  );
}
