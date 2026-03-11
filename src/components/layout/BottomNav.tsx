import {
  LayoutDashboard,
  FileText,
  Package,
  ShoppingCart,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";

const bottomItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Cupons", url: "/cupons", icon: FileText },
  { title: "Produtos", url: "/produtos", icon: Package },
  { title: "Lista", url: "/lista", icon: ShoppingCart },
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
          <item.icon className="h-5 w-5" />
          <span className="text-[10px] font-medium">{item.title}</span>
        </NavLink>
      ))}
    </nav>
  );
}
