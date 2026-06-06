import {
  LayoutDashboard,
  RefreshCcw,
  FileText,
  Users,
  UserCircle,
  Layers,
  Settings,
} from "lucide-react";

export const navigation = [
  { name: "Dashboard", href: "/overview", icon: LayoutDashboard },
  { name: "Cycles", href: "/cycles", icon: RefreshCcw },
  { name: "Templates", href: "/templates", icon: FileText },
  { name: "Teams", href: "/teams", icon: Users },
  { name: "People", href: "/people", icon: UserCircle },
  { name: "Levels", href: "/levels", icon: Layers },
] as const;

export const bottomNav = [
  { name: "Settings", href: "/settings", icon: Settings },
] as const;

export const externalNav = [] as const satisfies readonly {
  name: string;
  href: string;
  icon: typeof Settings;
}[];
