import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Search, RefreshCw } from "lucide-react";
import { format } from "date-fns";
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

export default function ProductCatalog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

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
        .select("canonical_name, purchase_frequency_days");
      return data ?? [];
    },
  });

  const freqMut = useMutation({
    mutationFn: async ({ name, days }: { name: string; days: number | null }) => {
      const { data: existing } = await supabase
        .from("product_catalog")
        .select("id")
        .eq("canonical_name", name)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("product_catalog")
          .update({ purchase_frequency_days: days })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("product_catalog")
          .insert({ canonical_name: name, purchase_frequency_days: days });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-catalog-freq"] });
      toast.success("Recorrência atualizada");
    },
  });

  const getFrequency = (normalizedName: string): string => {
    const entry = catalog?.find((c) => c.canonical_name === normalizedName);
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar produto ou código..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">{smName}</span>
                    <Select
                      value={getFrequency(p.product_name_normalized)}
                      onValueChange={(v) =>
                        freqMut.mutate({
                          name: p.product_name_normalized,
                          days: v === "none" ? null : Number(v),
                        })
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
                  <TableHead>Supermercado</TableHead>
                  <TableHead className="w-36">
                    <RefreshCw className="h-3 w-3 inline mr-1" />Recorrência
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const smName = (p.supermarkets as any)?.trade_name || (p.supermarkets as any)?.name || "—";
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
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {smName}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={getFrequency(p.product_name_normalized)}
                          onValueChange={(v) =>
                            freqMut.mutate({
                              name: p.product_name_normalized,
                              days: v === "none" ? null : Number(v),
                            })
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
