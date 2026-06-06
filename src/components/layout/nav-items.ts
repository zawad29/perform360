import {
  LayoutDashboard,
  RefreshCcw,
  Users,
  FileText,
  UserCircle,
  Settings,
} from "lucide-react";

export const navigation = [
  { name: "Dashboard", href: "/overview", icon: LayoutDashboard },
  { name: "Cycles", href: "/cycles", icon: RefreshCcw },
  { name: "Teams", href: "/teams", icon: Users },
  { name: "Templates", href: "/templates", icon: FileText },
  { name: "People", href: "/people", icon: UserCircle },
] as const;

export const bottomNav = [
  { name: "Settings", href: "/settings", icon: Settings },
] as const;

export const externalNav = [] as const satisfies readonly {
  name: string;
  href: string;
  icon: typeof Settings;
}[];
