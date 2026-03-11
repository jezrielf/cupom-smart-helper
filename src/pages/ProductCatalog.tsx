import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Search, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatProductDetail } from "@/lib/formatUnit";
import { toast } from "sonner";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FREQUENCY_OPTIONS = [
  { value: "none", label: "Sem recorrência" },
  { value: "15", label: "Quinzenal" },
  { value: "30", label: "Mensal" },
  { value: "60", label: "Bimestral" },
  { value: "90", label: "Trimestral" },
];

function PriceLine({ label, localPrice, onlinePrice, onlineUrl, updatedAt, onRefresh, isRefreshing }: {
  label: string;
  localPrice: number;
  onlinePrice: number | null;
  onlineUrl: string | null;
  updatedAt: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  if (onlinePrice && onlinePrice > 0) {
    const diff = ((onlinePrice - localPrice) / localPrice) * 100;
    const isCheaper = diff < 0;
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground font-medium w-6">{label}</span>
        {onlineUrl ? (
          <a href={onlineUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-foreground hover:underline flex items-center gap-0.5">
            {formatBRL(onlinePrice)}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs font-medium text-foreground">{formatBRL(onlinePrice)}</span>
        )}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isCheaper ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
          {isCheaper ? "" : "+"}{diff.toFixed(0)}%
        </span>
        <button onClick={onRefresh} disabled={isRefreshing} className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
          {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
        {updatedAt && (
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale: ptBR })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground font-medium w-6">{label}</span>
      <button onClick={onRefresh} disabled={isRefreshing} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-50">
        {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        <span>Buscar</span>
      </button>
    </div>
  );
}

function OnlinePriceBadge({ localPrice, entry, onRefreshAmazon, onRefreshML, isRefreshingAmazon, isRefreshingML }: {
  localPrice: number;
  entry: any;
  onRefreshAmazon: () => void;
  onRefreshML: () => void;
  isRefreshingAmazon: boolean;
  isRefreshingML: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <PriceLine
        label="AMZ"
        localPrice={localPrice}
        onlinePrice={entry?.online_price ? Number(entry.online_price) : null}
        onlineUrl={entry?.online_url ?? null}
        updatedAt={entry?.online_updated_at ?? null}
        onRefresh={onRefreshAmazon}
        isRefreshing={isRefreshingAmazon}
      />
      <PriceLine
        label="ML"
        localPrice={localPrice}
        onlinePrice={entry?.ml_price ? Number(entry.ml_price) : null}
        onlineUrl={entry?.ml_url ?? null}
        updatedAt={entry?.ml_updated_at ?? null}
        onRefresh={onRefreshML}
        isRefreshing={isRefreshingML}
      />
    </div>
  );
}

export default function ProductCatalog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [refreshingAmazon, setRefreshingAmazon] = useState<Set<string>>(new Set());
  const [refreshingML, setRefreshingML] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; currentProduct: string } | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["user-products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, supermarkets(name, trade_name)")
        .eq("user_id", user!.id)
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: catalog } = useQuery({
    queryKey: ["product-catalog-freq"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_catalog")
        .select("canonical_name, purchase_frequency_days, online_price, online_url, online_updated_at, ml_price, ml_url, ml_updated_at");
      return data ?? [];
    },
  });

  const freqMut = useMutation({
    mutationFn: async ({ name, days }: { name: string; days: number | null }) => {
      const { data: userProducts } = await supabase
        .from("products")
        .select("unit_price, purchase_date")
        .eq("product_name_normalized", name)
        .eq("user_id", user!.id);

      const avgPrice = userProducts && userProducts.length > 0
        ? userProducts.reduce((s, p) => s + Number(p.unit_price), 0) / userProducts.length
        : null;
      const lastPurchasedAt = userProducts && userProducts.length > 0
        ? userProducts.sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime())[0].purchase_date
        : null;

      const upsertData = {
        canonical_name: name,
        purchase_frequency_days: days,
        avg_price: avgPrice,
        last_purchased_at: lastPurchasedAt,
      };

      const { data: existing } = await supabase
        .from("product_catalog")
        .select("id")
        .eq("canonical_name", name)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from("product_catalog").update(upsertData).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_catalog").insert(upsertData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-catalog-freq"] });
      qc.invalidateQueries({ queryKey: ["product-catalog-recurrence"] });
      toast.success("Recorrência atualizada");
    },
  });

  const handleRefreshOnlinePrice = async (normalizedName: string) => {
    setRefreshingAmazon((prev) => new Set(prev).add(normalizedName));
    try {
      const { data, error } = await supabase.functions.invoke("search-amazon", {
        body: { product_name: normalizedName },
      });

      if (error || !data?.success || !data.results?.length) {
        return;
      }

      const cheapest = data.results.reduce((min: any, r: any) => (r.price < min.price ? r : min), data.results[0]);

      const { data: existing } = await supabase
        .from("product_catalog")
        .select("id")
        .eq("canonical_name", normalizedName)
        .maybeSingle();

      const onlineData = {
        online_price: cheapest.price,
        online_url: cheapest.url || data.search_url,
        online_updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from("product_catalog").update(onlineData).eq("id", existing.id);
      } else {
        await supabase.from("product_catalog").insert({ canonical_name: normalizedName, ...onlineData });
      }

      qc.invalidateQueries({ queryKey: ["product-catalog-freq"] });
    } catch {
      toast.error("Erro ao buscar preço Amazon");
    } finally {
      setRefreshingAmazon((prev) => {
        const next = new Set(prev);
        next.delete(normalizedName);
        return next;
      });
    }
  };

  const handleRefreshMLPrice = async (normalizedName: string) => {
    setRefreshingML((prev) => new Set(prev).add(normalizedName));
    try {
      const { data, error } = await supabase.functions.invoke("search-mercadolivre", {
        body: { product_name: normalizedName },
      });

      if (error || !data?.success || !data.results?.length) {
        return;
      }

      const cheapest = data.results.reduce((min: any, r: any) => (r.price < min.price ? r : min), data.results[0]);

      const { data: existing } = await supabase
        .from("product_catalog")
        .select("id")
        .eq("canonical_name", normalizedName)
        .maybeSingle();

      const mlData = {
        ml_price: cheapest.price,
        ml_url: cheapest.url || data.search_url,
        ml_updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from("product_catalog").update(mlData).eq("id", existing.id);
      } else {
        await supabase.from("product_catalog").insert({ canonical_name: normalizedName, ...mlData });
      }

      qc.invalidateQueries({ queryKey: ["product-catalog-freq"] });
    } catch {
      toast.error("Erro ao buscar preço Mercado Livre");
    } finally {
      setRefreshingML((prev) => {
        const next = new Set(prev);
        next.delete(normalizedName);
        return next;
      });
    }
  };

  const handleRefreshAll = async () => {
    const uniqueNames = [...new Set(filtered.map((p) => p.product_name_normalized))];
    if (uniqueNames.length === 0) return;
    setBulkProgress({ current: 0, total: uniqueNames.length, currentProduct: uniqueNames[0] });
    let successCount = 0;
    for (let i = 0; i < uniqueNames.length; i++) {
      setBulkProgress({ current: i, total: uniqueNames.length, currentProduct: uniqueNames[i] });
      try {
        await handleRefreshOnlinePrice(uniqueNames[i]);
        await new Promise((r) => setTimeout(r, 1000));
        await handleRefreshMLPrice(uniqueNames[i]);
        successCount++;
      } catch {}
      if (i < uniqueNames.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setBulkProgress(null);
    toast.success(`${successCount} de ${uniqueNames.length} preços atualizados`);
  };

  const getCatalogEntry = (normalizedName: string) => catalog?.find((c) => c.canonical_name === normalizedName);
  const getFrequency = (normalizedName: string): string => {
    const entry = getCatalogEntry(normalizedName);
    return entry?.purchase_frequency_days ? String(entry.purchase_frequency_days) : "none";
  };

  const filtered = products?.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.product_name.toLowerCase().includes(q) || p.product_name_normalized.toLowerCase().includes(q) || p.product_code?.toLowerCase().includes(q);
  }) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Produtos</h1>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar produto ou código..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={!!bulkProgress || filtered.length === 0}
            className="whitespace-nowrap"
          >
            {bulkProgress ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            {bulkProgress ? "Atualizando..." : "Atualizar todos"}
          </Button>
        </div>
        {bulkProgress && (
          <div className="max-w-lg space-y-1">
            <Progress value={(bulkProgress.current / bulkProgress.total) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground truncate">
              {bulkProgress.current + 1} de {bulkProgress.total} — {bulkProgress.currentProduct}
            </p>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Package className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">{products?.length === 0 ? "Nenhum produto encontrado nos seus cupons." : "Nenhum resultado encontrado."}</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((p) => {
              const smName = (p.supermarkets as any)?.trade_name || (p.supermarkets as any)?.name || "—";
              const entry = getCatalogEntry(p.product_name_normalized);
              return (
                <div key={p.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-foreground leading-tight">{p.product_name}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(p.purchase_date), "dd/MM/yy")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatProductDetail(Number(p.quantity), p.unit, Number(p.unit_price))}</span>
                    <span className="font-medium text-foreground">{formatBRL(Number(p.total_price))}</span>
                  </div>
                  <OnlinePriceBadge
                    localPrice={Number(p.unit_price)}
                    entry={entry}
                    onRefreshAmazon={() => handleRefreshOnlinePrice(p.product_name_normalized)}
                    onRefreshML={() => handleRefreshMLPrice(p.product_name_normalized)}
                    isRefreshingAmazon={refreshingAmazon.has(p.product_name_normalized)}
                    isRefreshingML={refreshingML.has(p.product_name_normalized)}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">{smName}</span>
                    <Select
                      value={getFrequency(p.product_name_normalized)}
                      onValueChange={(v) =>
                        freqMut.mutate({ name: p.product_name_normalized, days: v === "none" ? null : Number(v) })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="rounded-lg border border-border overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Qtd / Unid.</TableHead>
                  <TableHead className="text-right">Preço Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Online (AMZ / ML)</TableHead>
                  <TableHead>Supermercado</TableHead>
                  <TableHead className="w-36">
                    <RefreshCw className="h-3 w-3 inline mr-1" />Recorrência
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const smName = (p.supermarkets as any)?.trade_name || (p.supermarkets as any)?.name || "—";
                  const entry = getCatalogEntry(p.product_name_normalized);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(p.purchase_date), "dd/MM/yy")}
                      </TableCell>
                      <TableCell className="font-medium text-foreground text-sm max-w-[200px] truncate">
                        {p.product_name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.product_code || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatProductDetail(Number(p.quantity), p.unit, Number(p.unit_price))}
                      </TableCell>
                      <TableCell className="text-right text-xs text-foreground">
                        {formatBRL(Number(p.unit_price))}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium text-foreground">
                        {formatBRL(Number(p.total_price))}
                      </TableCell>
                      <TableCell>
                        <OnlinePriceBadge
                          localPrice={Number(p.unit_price)}
                          entry={entry}
                          onRefreshAmazon={() => handleRefreshOnlinePrice(p.product_name_normalized)}
                          onRefreshML={() => handleRefreshMLPrice(p.product_name_normalized)}
                          isRefreshingAmazon={refreshingAmazon.has(p.product_name_normalized)}
                          isRefreshingML={refreshingML.has(p.product_name_normalized)}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {smName}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={getFrequency(p.product_name_normalized)}
                          onValueChange={(v) =>
                            freqMut.mutate({ name: p.product_name_normalized, days: v === "none" ? null : Number(v) })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FREQUENCY_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
