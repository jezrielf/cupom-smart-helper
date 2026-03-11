import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, Star, Search, MapPin, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatCNPJ = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export default function Supermarkets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: supermarkets, isLoading } = useQuery({
    queryKey: ["supermarkets-all"],
    queryFn: async () => {
      const { data } = await supabase.from("supermarkets").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: receipts } = useQuery({
    queryKey: ["receipts-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("receipts").select("id, supermarket_id, total_amount, purchase_date, item_count").eq("user_id", user!.id);
      return data ?? [];
    },
  });

  const favMut = useMutation({
    mutationFn: async ({ id, fav }: { id: string; fav: boolean }) => {
      const { error } = await supabase.from("supermarkets").update({ is_favorite: fav }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supermarkets-all"] }),
  });

  const filtered = supermarkets?.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.trade_name?.toLowerCase().includes(q);
  }) ?? [];

  const getStats = (id: string) => {
    const r = receipts?.filter((r) => r.supermarket_id === id) ?? [];
    return { count: r.length, total: r.reduce((s, r) => s + Number(r.total_amount), 0) };
  };

  const selectedSupermarket = supermarkets?.find((s) => s.id === selectedId);
  const selectedReceipts = receipts?.filter((r) => r.supermarket_id === selectedId)?.sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime()).slice(0, 10) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Supermercados</h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Supermercados</h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar supermercado..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Store className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhum supermercado encontrado.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const stats = getStats(s.id);
            return (
              <Card key={s.id} className="border-border bg-card cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setSelectedId(s.id)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{s.trade_name || s.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCNPJ(s.cnpj)}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); favMut.mutate({ id: s.id, fav: !s.is_favorite }); }}>
                      <Star className={`h-4 w-4 ${s.is_favorite ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                    </Button>
                  </div>
                  {(s.address || s.neighborhood || s.city) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[s.neighborhood, s.city, s.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <div className="flex gap-4 pt-1">
                    <span className="text-xs text-muted-foreground"><FileText className="h-3 w-3 inline mr-1" />{stats.count} cupons</span>
                    <span className="text-xs text-muted-foreground font-medium">{formatBRL(stats.total)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedSupermarket?.trade_name || selectedSupermarket?.name}</DialogTitle>
            <DialogDescription>{selectedSupermarket && formatCNPJ(selectedSupermarket.cnpj)}</DialogDescription>
          </DialogHeader>
          {selectedSupermarket?.address && <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedSupermarket.address}</p>}
          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium text-foreground">Últimos cupons</p>
            {selectedReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cupom neste supermercado.</p>
            ) : (
              selectedReceipts.map((r) => (
                <div key={r.id} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{format(new Date(r.purchase_date), "dd/MM/yyyy")}</span>
                  <span className="text-foreground font-medium">{formatBRL(Number(r.total_amount))}</span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
