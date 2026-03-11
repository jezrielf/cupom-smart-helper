import {
  LayoutDashboard,
  QrCode,
  FileText,
  Store,
  BarChart3,
  Package,
  ShoppingCart,
  TrendingUp,
  Globe,
  LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Ler Cupom", url: "/scanner", icon: QrCode, highlight: true },
  { title: "Meus Cupons", url: "/cupons", icon: FileText },
  { title: "Supermercados", url: "/supermercados", icon: Store },
  { title: "Comparativo", url: "/comparativo", icon: BarChart3 },
  { title: "Produtos", url: "/produtos", icon: Package },
  { title: "Lista de Compras", url: "/lista", icon: ShoppingCart, badge: 3 },
  { title: "Análises", url: "/analises", icon: TrendingUp },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut } = useAuth();

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            CS
          </div>
          {!collapsed && (
            <span className="font-semibold text-sidebar-foreground text-lg tracking-tight">
              CupomSmart
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                        item.highlight && !isActive(item.url)
                          ? "text-primary hover:bg-primary/10"
                          : "hover:bg-sidebar-accent"
                      }`}
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && (
                        <span className="flex-1">{item.title}</span>
                      )}
                      {!collapsed && item.badge && (
                        <Badge className="h-5 min-w-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs px-1.5">
                          {item.badge}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={user?.user_metadata?.avatar_url} />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.user_metadata?.full_name || user?.email}
              </p>
              <button
                onClick={signOut}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <LogOut className="h-3 w-3" />
                Sair
              </button>
            </div>
          )}
          {collapsed && (
            <button onClick={signOut} className="sr-only">
              Sair
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
