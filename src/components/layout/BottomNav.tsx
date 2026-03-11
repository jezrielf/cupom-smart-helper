import {
  LayoutDashboard,
  QrCode,
  FileText,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";

const bottomItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Cupons", url: "/cupons", icon: FileText },
  { title: "Scanner", url: "/scanner", icon: QrCode, highlight: true },
  { title: "Lista", url: "/lista", icon: ShoppingCart, badge: 3 },
  { title: "Análises", url: "/analises", icon: TrendingUp },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-card md:hidden">
      {bottomItems.map((item) => (
        <NavLink
          key={item.title}
          to={item.url}
          end={item.url === "/"}
          className="relative flex flex-col items-center justify-center gap-1 px-3 py-1 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          {item.highlight ? (
            <div className="flex h-11 w-11 -mt-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <item.icon className="h-5 w-5" />
            </div>
          ) : (
            <div className="relative">
              <item.icon className="h-5 w-5" />
              {item.badge && (
                <Badge className="absolute -top-2 -right-3 h-4 min-w-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] px-1 leading-none">
                  {item.badge}
                </Badge>
              )}
            </div>
          )}
          <span className="text-[10px] font-medium">{item.title}</span>
        </NavLink>
      ))}
    </nav>
  );
}
