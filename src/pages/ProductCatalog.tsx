import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Search, TrendingUp, TrendingDown, Minus, ShoppingBag } from "lucide-react";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ProductCatalog() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data: products, isLoading } = useQuery({
    queryKey: ["product-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_catalog")
        .select("*")
        .order("canonical_name");
      if (error) throw error;
      return data;
    },
  });

  const categories = [...new Set(products?.map((p) => p.category).filter(Boolean) ?? [])].sort();

  const filtered = products?.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.canonical_name.toLowerCase().includes(q);
    const matchCat = category === "all" || p.category === category;
    return matchSearch && matchCat;
  }) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Produtos</h1>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {categories.length > 0 && (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Package className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">{products?.length === 0 ? "Nenhum produto catalogado ainda." : "Nenhum resultado encontrado."}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const TrendIcon = p.min_price != null && p.max_price != null && p.avg_price != null
              ? p.max_price > p.avg_price * 1.1 ? TrendingUp
              : p.min_price < p.avg_price * 0.9 ? TrendingDown
              : Minus
              : Minus;
            const trendColor = TrendIcon === TrendingUp ? "text-destructive" : TrendIcon === TrendingDown ? "text-success" : "text-muted-foreground";

            return (
              <Card key={p.id} className="border-border bg-card">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <p className="font-medium text-foreground text-sm leading-tight">{p.canonical_name}</p>
                    <TrendIcon className={`h-4 w-4 shrink-0 ${trendColor}`} />
                  </div>
                  {p.category && <Badge variant="outline" className="text-[10px]">{p.category}</Badge>}
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Mínimo</p>
                      <p className="text-xs font-semibold text-success">{p.min_price != null ? formatBRL(Number(p.min_price)) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Médio</p>
                      <p className="text-xs font-semibold text-foreground">{p.avg_price != null ? formatBRL(Number(p.avg_price)) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Máximo</p>
                      <p className="text-xs font-semibold text-destructive">{p.max_price != null ? formatBRL(Number(p.max_price)) : "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                    <ShoppingBag className="h-3 w-3" />
                    {p.times_purchased ?? 0} compras
                    {p.unit && <span className="ml-auto">{p.unit}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
