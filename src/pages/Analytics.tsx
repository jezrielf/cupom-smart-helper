import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export default function Analytics() {
  const { user } = useAuth();

  const { data: receipts, isLoading } = useQuery({
    queryKey: ["receipts-analytics", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("receipts")
        .select("id, purchase_date, total_amount, supermarket_id, item_count")
        .eq("user_id", user!.id)
        .order("purchase_date");
      return data ?? [];
    },
  });

  const { data: supermarkets } = useQuery({
    queryKey: ["supermarkets-all"],
    queryFn: async () => {
      const { data } = await supabase.from("supermarkets").select("id, name, trade_name");
      return data ?? [];
    },
  });

  const { data: topProducts } = useQuery({
    queryKey: ["top-products-analytics", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("product_name_normalized, unit_price, quantity")
        .eq("user_id", user!.id);
      if (!data) return [];
      const map = new Map<string, { count: number; totalPrice: number; prices: number[] }>();
      data.forEach((p) => {
        const e = map.get(p.product_name_normalized) ?? { count: 0, totalPrice: 0, prices: [] };
        e.count += Number(p.quantity);
        e.totalPrice += Number(p.unit_price);
        e.prices.push(Number(p.unit_price));
        map.set(p.product_name_normalized, e);
      });
      return Array.from(map.entries())
        .map(([name, s]) => ({ name, count: s.count, avgPrice: s.totalPrice / s.prices.length, prices: s.prices }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
  });

  // Monthly data (12 months)
  const monthlyData = (() => {
    if (!receipts) return [];
    const months: { month: string; total: number; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM/yy", { locale: ptBR });
      const monthReceipts = receipts.filter((r) => r.purchase_date.startsWith(key));
      months.push({
        month: label,
        total: monthReceipts.reduce((s, r) => s + Number(r.total_amount), 0),
        count: monthReceipts.length,
      });
    }
    return months;
  })();

  // Pie data by supermarket
  const pieData = (() => {
    if (!receipts || !supermarkets) return [];
    const map = new Map<string, number>();
    receipts.forEach((r) => {
      if (r.supermarket_id) map.set(r.supermarket_id, (map.get(r.supermarket_id) ?? 0) + Number(r.total_amount));
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, value]) => {
        const s = supermarkets.find((s) => s.id === id);
        return { name: s?.trade_name || s?.name || "Outro", value };
      });
  })();

  // Trend KPIs
  const avgTicketCurrent = (() => {
    if (!receipts?.length) return 0;
    const recent = receipts.filter((r) => new Date(r.purchase_date) >= subMonths(new Date(), 3));
    return recent.length > 0 ? recent.reduce((s, r) => s + Number(r.total_amount), 0) / recent.length : 0;
  })();

  const avgTicketPrevious = (() => {
    if (!receipts?.length) return 0;
    const prev = receipts.filter((r) => {
      const d = new Date(r.purchase_date);
      return d >= subMonths(new Date(), 6) && d < subMonths(new Date(), 3);
    });
    return prev.length > 0 ? prev.reduce((s, r) => s + Number(r.total_amount), 0) / prev.length : 0;
  })();

  const inflationPct = avgTicketPrevious > 0 ? ((avgTicketCurrent - avgTicketPrevious) / avgTicketPrevious) * 100 : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Análises</h1>
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!receipts?.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <TrendingUp className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Sem dados para análise</h1>
        <p className="text-muted-foreground text-center max-w-md">Escaneie cupons para ver suas análises.</p>
        <Link to="/scanner" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <ScanLine className="h-4 w-4" /> Escanear Cupom
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Análises</h1>

      {/* Trend KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ticket Médio (3 meses)</p>
            <p className="text-xl font-bold text-foreground">{formatBRL(avgTicketCurrent)}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Inflação Pessoal</p>
            <div className="flex items-center gap-2">
              <p className={`text-xl font-bold ${inflationPct > 0 ? "text-destructive" : inflationPct < 0 ? "text-success" : "text-foreground"}`}>
                {inflationPct > 0 ? "+" : ""}{inflationPct.toFixed(1)}%
              </p>
              {inflationPct > 0 ? <TrendingUp className="h-4 w-4 text-destructive" /> : inflationPct < 0 ? <TrendingDown className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total de Compras</p>
            <p className="text-xl font-bold text-foreground">{receipts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Gastos Mensais (12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Distribuição por Supermercado</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      {topProducts && topProducts.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Top 10 Produtos Mais Comprados</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                  <TableHead className="text-right">Preço Médio</TableHead>
                  <TableHead className="text-right">Tendência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((p, i) => {
                  const trend = p.prices.length >= 2 ? p.prices[p.prices.length - 1] - p.prices[0] : 0;
                  return (
                    <TableRow key={p.name}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                      <TableCell className="text-right">{p.count}</TableCell>
                      <TableCell className="text-right">{formatBRL(p.avgPrice)}</TableCell>
                      <TableCell className="text-right">
                        {trend > 0 ? <Badge className="bg-destructive/20 text-destructive border-0"><TrendingUp className="h-3 w-3" /></Badge>
                          : trend < 0 ? <Badge className="bg-success/20 text-success border-0"><TrendingDown className="h-3 w-3" /></Badge>
                          : <Badge variant="outline"><Minus className="h-3 w-3" /></Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
