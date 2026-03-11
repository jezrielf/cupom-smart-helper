import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText, ScanLine, Trash2, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Receipts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [supermarketFilter, setSupermarketFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date-desc");

  const { data: supermarkets } = useQuery({
    queryKey: ["supermarkets-all"],
    queryFn: async () => {
      const { data } = await supabase.from("supermarkets").select("id, name, trade_name");
      return data ?? [];
    },
  });

  const { data: receipts, isLoading } = useQuery({
    queryKey: ["receipts-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select("*")
        .eq("user_id", user!.id)
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: selectedProducts } = useQuery({
    queryKey: ["receipt-products", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("receipt_id", selectedId!)
        .order("product_name");
      return data ?? [];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("products").delete().eq("receipt_id", id);
      const { error } = await supabase.from("receipts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipts-list"] });
      qc.invalidateQueries({ queryKey: ["receipts-dashboard"] });
      toast.success("Cupom excluído");
    },
  });

  const filtered = (() => {
    if (!receipts) return [];
    let list = [...receipts];
    if (supermarketFilter !== "all") list = list.filter((r) => r.supermarket_id === supermarketFilter);
    list.sort((a, b) => {
      if (sortBy === "date-asc") return new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime();
      if (sortBy === "value-desc") return Number(b.total_amount) - Number(a.total_amount);
      if (sortBy === "value-asc") return Number(a.total_amount) - Number(b.total_amount);
      return new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime();
    });
    return list;
  })();

  const selectedReceipt = receipts?.find((r) => r.id === selectedId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Meus Cupons</h1>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  if (!receipts?.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <FileText className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Nenhum cupom</h1>
        <p className="text-muted-foreground text-center max-w-md">Escaneie um cupom fiscal para começar.</p>
        <Link to="/scanner" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <ScanLine className="h-4 w-4" /> Escanear Cupom
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Meus Cupons</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={supermarketFilter} onValueChange={setSupermarketFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Supermercado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {supermarkets?.map((s) => <SelectItem key={s.id} value={s.id}>{s.trade_name || s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Mais recente</SelectItem>
            <SelectItem value="date-asc">Mais antigo</SelectItem>
            <SelectItem value="value-desc">Maior valor</SelectItem>
            <SelectItem value="value-asc">Menor valor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((r) => {
          const s = supermarkets?.find((s) => s.id === r.supermarket_id);
          return (
            <Card key={r.id} className="border-border bg-card cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setSelectedId(r.id)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{s?.trade_name || s?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.purchase_date), "dd/MM/yyyy HH:mm")} · {r.item_count ?? 0} itens</p>
                  {r.payment_method && <Badge variant="outline" className="mt-1 text-xs"><CreditCard className="h-3 w-3 mr-1" />{r.payment_method}</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-bold text-foreground">{formatBRL(Number(r.total_amount))}</p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => e.stopPropagation()}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os produtos vinculados também serão excluídos.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMut.mutate(r.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Cupom</DialogTitle>
            <DialogDescription>
              {selectedReceipt && format(new Date(selectedReceipt.purchase_date), "dd/MM/yyyy HH:mm")}
              {selectedReceipt?.payment_method && ` · ${selectedReceipt.payment_method}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {selectedProducts?.map((p) => (
              <div key={p.id} className="flex justify-between items-center text-sm py-1 border-b border-border last:border-0">
                <div className="flex-1">
                  <p className="text-foreground">{p.product_name}</p>
                  <p className="text-xs text-muted-foreground">{p.quantity} {p.unit} × {formatBRL(Number(p.unit_price))}</p>
                </div>
                <p className="font-medium text-foreground">{formatBRL(Number(p.total_price))}</p>
              </div>
            ))}
          </div>
          {selectedReceipt && (
            <div className="flex justify-between pt-3 border-t border-border mt-3">
              <span className="font-bold text-foreground">Total</span>
              <span className="font-bold text-foreground">{formatBRL(Number(selectedReceipt.total_amount))}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
