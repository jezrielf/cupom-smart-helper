import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Search, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export default function PriceComparison() {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  const { data: comparison, isLoading } = useQuery({
    queryKey: ["price-comparison", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_price_comparison", { search_term: search });
      if (error) throw error;
      return data;
    },
  });

  const { data: priceHistory } = useQuery({
    queryKey: ["price-history-chart", selectedProduct],
    enabled: !!selectedProduct,
    queryFn: async () => {
      const { data } = await supabase
        .from("price_history")
        .select("unit_price, purchase_date, supermarket_id")
        .eq("product_name_normalized", selectedProduct!)
        .order("purchase_date");
      return data ?? [];
    },
  });

  // Group comparison by product
  const grouped = (() => {
    if (!comparison) return new Map<string, typeof comparison>();
    const map = new Map<string, typeof comparison>();
    comparison.forEach((r) => {
      const arr = map.get(r.product_name_normalized) ?? [];
      arr.push(r);
      map.set(r.product_name_normalized, arr);
    });
    return map;
  })();

  // Chart data
  const chartData = (() => {
    if (!priceHistory?.length) return [];
    const supermarkets = [...new Set(priceHistory.map((p) => p.supermarket_id))];
    const dates = [...new Set(priceHistory.map((p) => format(new Date(p.purchase_date), "dd/MM")))];
    return dates.map((d) => {
      const row: Record<string, unknown> = { date: d };
      supermarkets.forEach((sid) => {
        const entry = priceHistory.find((p) => format(new Date(p.purchase_date), "dd/MM") === d && p.supermarket_id === sid);
        if (entry) row[sid] = Number(entry.unit_price);
      });
      return row;
    });
  })();

  const chartSupermarkets = selectedProduct ? [...new Set(priceHistory?.map((p) => p.supermarket_id) ?? [])] : [];
  const supermarketNames = new Map(comparison?.map((c) => [c.supermarket_id, c.supermarket_name]) ?? []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Comparativo de Preços</h1>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar produto (mín. 2 letras)..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {search.length < 2 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <BarChart3 className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Digite o nome de um produto para comparar preços.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : grouped.size === 0 ? (
        <p className="text-muted-foreground text-center py-10">Nenhum resultado para "{search}".</p>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([product, rows]) => {
            const minPrice = Math.min(...rows.map((r) => Number(r.last_price)));
            return (
              <Card key={product} className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-foreground cursor-pointer hover:text-primary" onClick={() => setSelectedProduct(selectedProduct === product ? null : product)}>
                    {product}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supermercado</TableHead>
                        <TableHead className="text-right">Último</TableHead>
                        <TableHead className="text-right">Médio</TableHead>
                        <TableHead className="text-right">Mín</TableHead>
                        <TableHead className="text-right">Máx</TableHead>
                        <TableHead className="text-right">Compras</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.supermarket_id}>
                          <TableCell className="font-medium">
                            {r.supermarket_name}
                            {Number(r.last_price) === minPrice && <Badge className="ml-2 bg-success/20 text-success border-0 text-[10px]"><TrendingDown className="h-3 w-3 mr-0.5" />Melhor</Badge>}
                          </TableCell>
                          <TableCell className="text-right">{formatBRL(Number(r.last_price))}</TableCell>
                          <TableCell className="text-right">{formatBRL(Number(r.avg_price))}</TableCell>
                          <TableCell className="text-right">{formatBRL(Number(r.min_price))}</TableCell>
                          <TableCell className="text-right">{formatBRL(Number(r.max_price))}</TableCell>
                          <TableCell className="text-right">{r.times_purchased}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}

          {/* Price History Chart */}
          {selectedProduct && chartData.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-foreground">Evolução: {selectedProduct}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} formatter={(v: number) => formatBRL(v)} />
                    <Legend />
                    {chartSupermarkets.map((sid, i) => (
                      <Line key={sid} type="monotone" dataKey={sid} name={supermarketNames.get(sid) ?? sid} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
