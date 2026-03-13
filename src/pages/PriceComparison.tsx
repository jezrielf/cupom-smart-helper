import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Search, TrendingDown, Store, ShoppingCart, ExternalLink } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

type SortOption = "name" | "price" | "savings";

export default function PriceComparison() {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const isMobile = useIsMobile();

  // Load ALL products automatically
  const { data: comparison, isLoading } = useQuery({
    queryKey: ["price-comparison-all"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_price_comparison", {});
      if (error) throw error;
      return data;
    },
  });

  // Load online prices from catalog
  const { data: catalog } = useQuery({
    queryKey: ["product-catalog-online"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_catalog")
        .select("canonical_name, online_price, ml_price, online_url, ml_url, ai_category, brand");
      return data ?? [];
    },
  });

  // Price history for chart
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

  // Build catalog map
  const catalogMap = useMemo(() => {
    const map = new Map<string, (typeof catalog)[0]>();
    catalog?.forEach((c) => map.set(c.canonical_name, c));
    return map;
  }, [catalog]);

  // Categories for filter
  const categories = useMemo(() => {
    const cats = new Set<string>();
    catalog?.forEach((c) => { if (c.ai_category) cats.add(c.ai_category); });
    return Array.from(cats).sort();
  }, [catalog]);

  // Group by product + filter + sort
  const grouped = useMemo(() => {
    if (!comparison) return [];
    const map = new Map<string, typeof comparison>();
    comparison.forEach((r) => {
      const arr = map.get(r.product_name_normalized) ?? [];
      arr.push(r);
      map.set(r.product_name_normalized, arr);
    });

    let entries = Array.from(map.entries());

    // Text filter
    if (search) {
      const s = search.toLowerCase();
      entries = entries.filter(([name]) => name.toLowerCase().includes(s));
    }

    // Category filter
    if (categoryFilter !== "all") {
      entries = entries.filter(([name]) => {
        const cat = catalogMap.get(name);
        return cat?.ai_category === categoryFilter;
      });
    }

    // Sort
    entries.sort((a, b) => {
      if (sortBy === "name") return a[0].localeCompare(b[0]);
      if (sortBy === "price") {
        const minA = Math.min(...a[1].map((r) => Number(r.last_price)));
        const minB = Math.min(...b[1].map((r) => Number(r.last_price)));
        return minA - minB;
      }
      // savings: biggest difference between max supermarket and best online
      const savingsOf = ([name, rows]: [string, typeof comparison]) => {
        const maxSuper = Math.max(...rows.map((r) => Number(r.last_price)));
        const cat = catalogMap.get(name);
        const bestOnline = Math.min(
          ...[cat?.online_price, cat?.ml_price].filter((p): p is number => p != null && p > 0)
        );
        return isFinite(bestOnline) ? maxSuper - bestOnline : 0;
      };
      return savingsOf(b) - savingsOf(a);
    });

    return entries;
  }, [comparison, search, categoryFilter, sortBy, catalogMap]);

  // Chart data
  const chartData = useMemo(() => {
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
  }, [priceHistory]);

  const chartSupermarkets = selectedProduct ? [...new Set(priceHistory?.map((p) => p.supermarket_id) ?? [])] : [];
  const supermarketNames = new Map(comparison?.map((c) => [c.supermarket_id, c.supermarket_name]) ?? []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Comparativo de Preços</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filtrar produtos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nome (A-Z)</SelectItem>
            <SelectItem value="price">Menor preço</SelectItem>
            <SelectItem value="savings">Maior economia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <BarChart3 className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            {search || categoryFilter !== "all" ? "Nenhum produto encontrado com esses filtros." : "Nenhum produto comprado ainda. Escaneie cupons para começar!"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{grouped.length} produto(s) encontrado(s)</p>

          {grouped.map(([product, rows]) => {
            const catEntry = catalogMap.get(product);
            const minSuperPrice = Math.min(...rows.map((r) => Number(r.last_price)));
            const onlinePrices: { name: string; price: number; url: string | null }[] = [];
            if (catEntry?.online_price && catEntry.online_price > 0)
              onlinePrices.push({ name: "Amazon", price: Number(catEntry.online_price), url: catEntry.online_url });
            if (catEntry?.ml_price && catEntry.ml_price > 0)
              onlinePrices.push({ name: "Mercado Livre", price: Number(catEntry.ml_price), url: catEntry.ml_url });

            const allPrices = [...rows.map((r) => Number(r.last_price)), ...onlinePrices.map((o) => o.price)];
            const globalMin = Math.min(...allPrices);

            return (
              <Card key={product} className="border-border bg-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle
                      className="text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
                      onClick={() => setSelectedProduct(selectedProduct === product ? null : product)}
                    >
                      {product}
                    </CardTitle>
                    {catEntry?.ai_category && (
                      <Badge variant="secondary" className="text-[10px]">{catEntry.ai_category}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {isMobile ? (
                    /* Mobile: compact cards */
                    <div className="space-y-2">
                      {rows.map((r) => (
                        <div key={r.supermarket_id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-2">
                            <Store className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{r.supermarket_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{formatBRL(Number(r.last_price))}</span>
                            {Number(r.last_price) === globalMin && (
                              <Badge className="bg-success/20 text-success border-0 text-[10px]">
                                <TrendingDown className="h-3 w-3 mr-0.5" />Melhor
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      {onlinePrices.map((o) => (
                        <div key={o.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-2">
                            <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{o.name}</span>
                            {o.url && (
                              <a href={o.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{formatBRL(o.price)}</span>
                            {o.price === globalMin && (
                              <Badge className="bg-success/20 text-success border-0 text-[10px]">
                                <TrendingDown className="h-3 w-3 mr-0.5" />Melhor
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Desktop: full table */
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Canal</TableHead>
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
                              <div className="flex items-center gap-2">
                                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                                {r.supermarket_name}
                                {Number(r.last_price) === globalMin && (
                                  <Badge className="bg-success/20 text-success border-0 text-[10px]">
                                    <TrendingDown className="h-3 w-3 mr-0.5" />Melhor
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatBRL(Number(r.last_price))}</TableCell>
                            <TableCell className="text-right">{formatBRL(Number(r.avg_price))}</TableCell>
                            <TableCell className="text-right">{formatBRL(Number(r.min_price))}</TableCell>
                            <TableCell className="text-right">{formatBRL(Number(r.max_price))}</TableCell>
                            <TableCell className="text-right">{r.times_purchased}</TableCell>
                          </TableRow>
                        ))}
                        {onlinePrices.map((o) => (
                          <TableRow key={o.name} className="border-t border-dashed">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                                {o.name}
                                {o.url && (
                                  <a href={o.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                  </a>
                                )}
                                {o.price === globalMin && (
                                  <Badge className="bg-success/20 text-success border-0 text-[10px]">
                                    <TrendingDown className="h-3 w-3 mr-0.5" />Melhor
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatBRL(o.price)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
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
