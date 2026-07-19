import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldAlert,
} from "lucide-react";

export type Role = "admin" | "moderator" | "viewer";

export interface NavItem {
  key: string;
  label: string;
  segment: string; // appended to /dashboard/[guildId]
  icon: LucideIcon;
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "overview",
    label: "Overview",
    segment: "",
    icon: LayoutDashboard,
    roles: ["viewer", "moderator", "admin"],
  },
  {
    key: "analytics",
    label: "Analytics",
    segment: "/analytics",
    icon: BarChart3,
    roles: ["viewer", "moderator", "admin"],
  },
  {
    key: "moderation",
    label: "Moderation",
    segment: "/moderation",
    icon: ShieldAlert,
    roles: ["moderator", "admin"],
  },
  {
    key: "logs",
    label: "Logs",
    segment: "/logs",
    icon: ScrollText,
    roles: ["moderator", "admin"],
  },
  {
    key: "settings",
    label: "Settings",
    segment: "/settings",
    icon: Settings,
    roles: ["admin"],
  },
];

export function canAccess(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}

export function navForRole(role: Role) {
  return NAV_ITEMS.filter((item) => canAccess(role, item.roles));
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  moderator: "Moderator",
  viewer: "Viewer",
};
