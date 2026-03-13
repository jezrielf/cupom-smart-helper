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

interface ProductGroup {
  product_name_normalized: string;
  supermarkets: {
    supermarket_id: string;
    supermarket_name: string;
    last_price: number;
    avg_price: number;
    min_price: number;
    max_price: number;
    times_purchased: number;
  }[];
}

export default function PriceComparison() {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const isMobile = useIsMobile();

  // Load products directly from products table (user's purchases)
  const { data: products, isLoading } = useQuery({
    queryKey: ["comparison-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("product_name_normalized, unit_price, supermarket_id, purchase_date")
        .order("product_name_normalized");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Load supermarkets
  const { data: supermarkets } = useQuery({
    queryKey: ["supermarkets-all"],
    queryFn: async () => {
      const { data } = await supabase.from("supermarkets").select("id, name, brand_color, logo_url");
      return data ?? [];
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

  // Maps
  const supermarketMap = useMemo(() => {
    const map = new Map<string, { name: string; brand_color: string | null; logo_url: string | null }>();
    supermarkets?.forEach((s) => map.set(s.id, { name: s.name, brand_color: s.brand_color, logo_url: s.logo_url }));
    return map;
  }, [supermarkets]);

  const catalogMap = useMemo(() => {
    const map = new Map<string, (typeof catalog extends (infer T)[] | null ? T : never)>();
    catalog?.forEach((c) => map.set(c.canonical_name, c));
    return map;
  }, [catalog]);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    catalog?.forEach((c) => { if (c.ai_category) cats.add(c.ai_category); });
    return Array.from(cats).sort();
  }, [catalog]);

  // Group products by name + supermarket
  const grouped = useMemo((): ProductGroup[] => {
    if (!products?.length) return [];

    const map = new Map<string, Map<string, { prices: number[]; count: number }>>();
    products.forEach((p) => {
      if (!p.supermarket_id) return;
      let prodMap = map.get(p.product_name_normalized);
      if (!prodMap) { prodMap = new Map(); map.set(p.product_name_normalized, prodMap); }
      let entry = prodMap.get(p.supermarket_id);
      if (!entry) { entry = { prices: [], count: 0 }; prodMap.set(p.supermarket_id, entry); }
      entry.prices.push(Number(p.unit_price));
      entry.count++;
    });

    let groups: ProductGroup[] = Array.from(map.entries()).map(([name, smMap]) => ({
      product_name_normalized: name,
      supermarkets: Array.from(smMap.entries()).map(([sid, data]) => ({
        supermarket_id: sid,
        supermarket_name: supermarketMap.get(sid)?.name ?? sid,
        last_price: data.prices[data.prices.length - 1],
        avg_price: data.prices.reduce((a, b) => a + b, 0) / data.prices.length,
        min_price: Math.min(...data.prices),
        max_price: Math.max(...data.prices),
        times_purchased: data.count,
      })),
    }));

    // Text filter
    if (search) {
      const s = search.toLowerCase();
      groups = groups.filter((g) => g.product_name_normalized.toLowerCase().includes(s));
    }

    // Category filter
    if (categoryFilter !== "all") {
      groups = groups.filter((g) => catalogMap.get(g.product_name_normalized)?.ai_category === categoryFilter);
    }

    // Sort
    groups.sort((a, b) => {
      if (sortBy === "name") return a.product_name_normalized.localeCompare(b.product_name_normalized);
      if (sortBy === "price") {
        const minA = Math.min(...a.supermarkets.map((s) => s.last_price));
        const minB = Math.min(...b.supermarkets.map((s) => s.last_price));
        return minA - minB;
      }
      const savingsOf = (g: ProductGroup) => {
        const maxSuper = Math.max(...g.supermarkets.map((s) => s.last_price));
        const cat = catalogMap.get(g.product_name_normalized);
        const onlinePrices = [cat?.online_price, cat?.ml_price].filter((p): p is number => p != null && p > 0);
        const bestOnline = onlinePrices.length ? Math.min(...onlinePrices) : Infinity;
        return isFinite(bestOnline) ? maxSuper - bestOnline : 0;
      };
      return savingsOf(b) - savingsOf(a);
    });

    return groups;
  }, [products, supermarketMap, search, categoryFilter, sortBy, catalogMap]);

  // Chart data
  const chartData = useMemo(() => {
    if (!priceHistory?.length) return [];
    const sids = [...new Set(priceHistory.map((p) => p.supermarket_id))];
    const dates = [...new Set(priceHistory.map((p) => format(new Date(p.purchase_date), "dd/MM")))];
    return dates.map((d) => {
      const row: Record<string, unknown> = { date: d };
      sids.forEach((sid) => {
        const entry = priceHistory.find((p) => format(new Date(p.purchase_date), "dd/MM") === d && p.supermarket_id === sid);
        if (entry) row[sid] = Number(entry.unit_price);
      });
      return row;
    });
  }, [priceHistory]);

  const chartSupermarkets = selectedProduct ? [...new Set(priceHistory?.map((p) => p.supermarket_id) ?? [])] : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Comparativo de Preços</h1>

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

          {grouped.map(({ product_name_normalized: product, supermarkets: rows }) => {
            const catEntry = catalogMap.get(product);
            const onlinePrices: { name: string; price: number; url: string | null }[] = [];
            if (catEntry?.online_price && Number(catEntry.online_price) > 0)
              onlinePrices.push({ name: "Amazon", price: Number(catEntry.online_price), url: catEntry.online_url });
            if (catEntry?.ml_price && Number(catEntry.ml_price) > 0)
              onlinePrices.push({ name: "Mercado Livre", price: Number(catEntry.ml_price), url: catEntry.ml_url });

            const allPrices = [...rows.map((r) => r.last_price), ...onlinePrices.map((o) => o.price)];
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
                    <div className="space-y-2">
                      {rows.map((r) => (
                        <div key={r.supermarket_id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-2">
                            <Store className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{r.supermarket_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{formatBRL(r.last_price)}</span>
                            {r.last_price === globalMin && (
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
                                {r.last_price === globalMin && (
                                  <Badge className="bg-success/20 text-success border-0 text-[10px]">
                                    <TrendingDown className="h-3 w-3 mr-0.5" />Melhor
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatBRL(r.last_price)}</TableCell>
                            <TableCell className="text-right">{formatBRL(r.avg_price)}</TableCell>
                            <TableCell className="text-right">{formatBRL(r.min_price)}</TableCell>
                            <TableCell className="text-right">{formatBRL(r.max_price)}</TableCell>
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
                      <Line key={sid} type="monotone" dataKey={sid} name={supermarketMap.get(sid)?.name ?? sid} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
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
