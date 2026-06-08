import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, DollarSign, Receipt, Store, Package, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { format, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { AISuggestions, type AISuggestion } from "@/components/ai/AISuggestions";
import { useAIProductIntelligence } from "@/hooks/useAIProductIntelligence";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Dashboard() {
  const { user } = useAuth();
  const { analyze, analyzing, lastResult } = useAIProductIntelligence();
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  const { data: receipts, isLoading: loadingReceipts } = useQuery({
    queryKey: ["receipts-dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("id, purchase_date, total_amount, item_count, supermarket_id")
        .eq("user_id", user!.id)
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: supermarkets } = useQuery({
    queryKey: ["supermarkets-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supermarkets").select("id, name, trade_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: productCount } = useQuery({
    queryKey: ["products-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("product_name_normalized")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set(data.map((p) => p.product_name_normalized)).size;
    },
  });

  // Fetch recent products for AI analysis
  const { data: recentProducts } = useQuery({
    queryKey: ["recent-products-ai", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("product_name, product_name_normalized, unit_price, quantity, unit")
        .eq("user_id", user!.id)
        .order("purchase_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  // Auto-trigger AI analysis when recent products are loaded
  useEffect(() => {
    if (recentProducts && recentProducts.length > 0 && suggestions.length === 0 && !analyzing) {
      analyze(recentProducts, { showToasts: false }).then((result) => {
        if (result?.suggestions) setSuggestions(result.suggestions);
      });
    }
  }, [recentProducts, analyze, analyzing, suggestions.length]);

  const handleRefreshAI = () => {
    if (recentProducts && recentProducts.length > 0) {
      analyze(recentProducts, { showToasts: false }).then((result) => {
        if (result?.suggestions) setSuggestions(result.suggestions);
      });
    }
  };

  const totalReceipts = receipts?.length ?? 0;
  const totalSpent = receipts?.reduce((s, r) => s + Number(r.total_amount), 0) ?? 0;
  const avgTicket = totalReceipts > 0 ? totalSpent / totalReceipts : 0;
  const uniqueSupermarkets = new Set(receipts?.map((r) => r.supermarket_id).filter(Boolean)).size;

  // Monthly spending (last 6 months)
  const monthlyData = (() => {
    if (!receipts) return [];
    const months: { month: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM", { locale: ptBR });
      const total = receipts
        .filter((r) => r.purchase_date.startsWith(key))
        .reduce((s, r) => s + Number(r.total_amount), 0);
      months.push({ month: label.charAt(0).toUpperCase() + label.slice(1), total });
    }
    return months;
  })();

  // Top 5 supermarkets
  const topSupermarkets = (() => {
    if (!receipts || !supermarkets) return [];
    const map = new Map<string, number>();
    receipts.forEach((r) => {
      if (r.supermarket_id) map.set(r.supermarket_id, (map.get(r.supermarket_id) ?? 0) + Number(r.total_amount));
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, total]) => {
        const s = supermarkets.find((s) => s.id === id);
        return { name: s?.trade_name || s?.name || "Desconhecido", total };
      });
  })();

  const recentReceipts = receipts?.slice(0, 5) ?? [];

  const kpis = [
    { label: "Total Cupons", value: totalReceipts, icon: FileText, fmt: (v: number) => String(v) },
    { label: "Gasto Total", value: totalSpent, icon: DollarSign, fmt: formatBRL },
    { label: "Ticket Médio", value: avgTicket, icon: Receipt, fmt: formatBRL },
    { label: "Supermercados", value: uniqueSupermarkets, icon: Store, fmt: (v: number) => String(v) },
    { label: "Produtos Únicos", value: productCount ?? 0, icon: Package, fmt: (v: number) => String(v) },
  ];

  if (loadingReceipts) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (totalReceipts === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <ScanLine className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Nenhum cupom ainda</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Escaneie seu primeiro cupom fiscal para ver suas estatísticas aqui.
        </p>
        <Link to="/scanner" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <ScanLine className="h-4 w-4" /> Escanear Cupom
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <k.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <p className="text-xl font-bold text-foreground">{k.fmt(k.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Suggestions */}
      <AISuggestions
        suggestions={suggestions}
        loading={analyzing}
        onRefresh={handleRefreshAI}
      />

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Gastos Mensais</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Top Supermercados</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topSupermarkets} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={100} />
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                <Bar dataKey="total" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Receipts */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground">Últimos Cupons</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentReceipts.map((r) => {
              const s = supermarkets?.find((s) => s.id === r.supermarket_id);
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-accent/50 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{s?.trade_name || s?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(r.purchase_date), "dd/MM/yyyy")} · {r.item_count ?? 0} itens</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{formatBRL(Number(r.total_amount))}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
