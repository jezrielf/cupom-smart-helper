import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Plus, Trash2, Sparkles, AlertTriangle, Calendar } from "lucide-react";
import { toast } from "sonner";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PRIORITY_COLORS: Record<string, string> = { high: "bg-destructive/20 text-destructive", medium: "bg-warning/20 text-warning", low: "bg-muted text-muted-foreground" };
const PRIORITY_LABELS: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };
const FREQ_LABELS: Record<number, string> = { 7: "Semanal", 15: "Quinzenal", 30: "Mensal", 60: "Bimestral", 90: "Trimestral" };

function getNextPurchaseDate(lastPurchased: string | null, freqDays: number): Date {
  if (!lastPurchased) return new Date();
  const d = new Date(lastPurchased);
  d.setDate(d.getDate() + freqDays);
  return d;
}

function isUrgent(nextDate: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nd = new Date(nextDate);
  nd.setHours(0, 0, 0, 0);
  return nd <= today;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

type CatalogItem = {
  canonical_name: string;
  purchase_frequency_days: number | null;
  last_purchased_at: string | null;
  avg_price: number | null;
};

export default function ShoppingList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemPriority, setNewItemPriority] = useState("medium");

  const { data: lists, isLoading } = useQuery({
    queryKey: ["shopping-lists", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data.length > 0 && !activeListId) setActiveListId(data[0].id);
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["shopping-items", activeListId],
    enabled: !!activeListId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("*")
        .eq("shopping_list_id", activeListId!)
        .order("is_checked")
        .order("priority")
        .order("product_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: catalogData } = useQuery({
    queryKey: ["product-catalog-recurrence"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_catalog")
        .select("canonical_name, purchase_frequency_days, last_purchased_at, avg_price")
        .not("purchase_frequency_days", "is", null);
      if (error) throw error;
      return data as CatalogItem[];
    },
  });

  const catalogMap = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    catalogData?.forEach((c) => map.set(c.canonical_name.toLowerCase(), c));
    return map;
  }, [catalogData]);

  const getItemCatalog = (productName: string) => catalogMap.get(productName.toLowerCase());

  const fetchRecurringProducts = async () => {
    const { data } = await supabase
      .from("product_catalog")
      .select("canonical_name, avg_price, unit, purchase_frequency_days, last_purchased_at")
      .not("purchase_frequency_days", "is", null);
    if (!data) return [];
    const now = new Date();
    return data.filter((p) => {
      if (!p.last_purchased_at) return true;
      const last = new Date(p.last_purchased_at);
      const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= (p.purchase_frequency_days ?? 30);
    });
  };

  const createList = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .insert({ user_id: user!.id, name })
        .select()
        .single();
      if (error) throw error;
      const recurring = await fetchRecurringProducts();
      if (recurring.length > 0) {
        const itemsToInsert = recurring.map((p) => ({
          shopping_list_id: data.id,
          user_id: user!.id,
          product_name: p.canonical_name,
          quantity: 1,
          unit: p.unit ?? "UN",
          estimated_price: p.avg_price ? Number(p.avg_price) : null,
          priority: "medium",
        }));
        await supabase.from("shopping_list_items").insert(itemsToInsert);
      }
      return { list: data, suggestedCount: recurring.length };
    },
    onSuccess: ({ list, suggestedCount }) => {
      qc.invalidateQueries({ queryKey: ["shopping-lists"] });
      qc.invalidateQueries({ queryKey: ["shopping-items"] });
      setActiveListId(list.id);
      setNewListOpen(false);
      setNewListName("");
      toast.success(suggestedCount > 0 ? `Lista criada com ${suggestedCount} produto(s) sugerido(s)` : "Lista criada");
    },
  });

  const addSuggested = useMutation({
    mutationFn: async () => {
      if (!activeListId) return 0;
      const recurring = await fetchRecurringProducts();
      const existingNames = items?.map((i) => i.product_name.toLowerCase()) ?? [];
      const toAdd = recurring.filter((p) => !existingNames.includes(p.canonical_name.toLowerCase()));
      if (toAdd.length === 0) return 0;
      const itemsToInsert = toAdd.map((p) => ({
        shopping_list_id: activeListId,
        user_id: user!.id,
        product_name: p.canonical_name,
        quantity: 1,
        unit: p.unit ?? "UN",
        estimated_price: p.avg_price ? Number(p.avg_price) : null,
        priority: "medium",
      }));
      await supabase.from("shopping_list_items").insert(itemsToInsert);
      return toAdd.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["shopping-items"] });
      toast[count === 0 ? "info" : "success"](count === 0 ? "Todos os produtos recorrentes já estão na lista" : `${count} produto(s) adicionado(s)`);
    },
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("shopping_list_items").delete().eq("shopping_list_id", id);
      const { error } = await supabase.from("shopping_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-lists"] });
      setActiveListId(null);
      toast.success("Lista excluída");
    },
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shopping_list_items").insert({
        shopping_list_id: activeListId!,
        user_id: user!.id,
        product_name: newItemName.trim(),
        quantity: Number(newItemQty) || 1,
        priority: newItemPriority,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-items"] });
      setNewItemName("");
      setNewItemQty("1");
    },
  });

  const toggleItem = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      await supabase.from("shopping_list_items").update({ is_checked: checked }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping-items"] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("shopping_list_items").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping-items"] }),
  });

  const estimatedTotal = items?.reduce((s, i) => s + (Number(i.estimated_price) || 0) * (Number(i.quantity) || 1), 0) ?? 0;
  const checkedCount = items?.filter((i) => i.is_checked).length ?? 0;
  const totalCount = items?.length ?? 0;

  const urgentCount = useMemo(() => {
    if (!items) return 0;
    return items.filter((item) => {
      if (item.is_checked) return false;
      const cat = getItemCatalog(item.product_name);
      if (!cat || !cat.purchase_frequency_days) return false;
      const nextDate = getNextPurchaseDate(cat.last_purchased_at, cat.purchase_frequency_days);
      return isUrgent(nextDate);
    }).length;
  }, [items, catalogMap]);

  // Recurring products not yet in the active list
  const pendingRecurring = useMemo(() => {
    if (!catalogData) return [];
    const existingNames = new Set(items?.map((i) => i.product_name.toLowerCase()) ?? []);
    return catalogData.filter((c) => {
      if (!c.purchase_frequency_days) return false;
      if (existingNames.has(c.canonical_name.toLowerCase())) return false;
      const nextDate = getNextPurchaseDate(c.last_purchased_at, c.purchase_frequency_days);
      return isUrgent(nextDate);
    });
  }, [catalogData, items]);

  const addRecurringItem = useMutation({
    mutationFn: async (cat: CatalogItem) => {
      const { error } = await supabase.from("shopping_list_items").insert({
        shopping_list_id: activeListId!,
        user_id: user!.id,
        product_name: cat.canonical_name,
        quantity: 1,
        estimated_price: cat.avg_price ? Number(cat.avg_price) : null,
        priority: "medium",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-items"] });
      toast.success("Produto adicionado à lista");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Lista de Compras</h1>
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Lista de Compras</h1>
        <Button size="sm" onClick={() => setNewListOpen(true)}><Plus className="h-4 w-4 mr-1" />Nova Lista</Button>
      </div>

      {!lists?.length ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <ShoppingCart className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Crie sua primeira lista de compras.</p>
          {pendingRecurring.length > 0 && (
            <p className="text-sm text-primary font-medium">{pendingRecurring.length} produto(s) recorrente(s) pendente(s) serão adicionados automaticamente.</p>
          )}
          <Button onClick={() => setNewListOpen(true)}><Plus className="h-4 w-4 mr-1" />Nova Lista</Button>
        </div>
      ) : (
        <>
          <div className="flex gap-3 items-center flex-wrap">
            <Select value={activeListId ?? ""} onValueChange={setActiveListId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Selecione uma lista" /></SelectTrigger>
              <SelectContent>
                {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {activeListId && (
              <>
                <Button variant="outline" size="sm" onClick={() => addSuggested.mutate()} disabled={addSuggested.isPending}>
                  <Sparkles className="h-4 w-4 mr-1" />Sugerir
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir lista?</AlertDialogTitle>
                      <AlertDialogDescription>Todos os itens serão excluídos.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteList.mutate(activeListId)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>

          {activeListId && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">{checkedCount}/{totalCount} itens</span>
                    {estimatedTotal > 0 && (
                      <span className="text-base font-semibold text-primary">
                        Total: {formatBRL(estimatedTotal)}
                      </span>
                    )}
                  </div>
                  {urgentCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{urgentCount} {urgentCount === 1 ? "item urgente" : "itens urgentes"}</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="Nome do produto" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="flex-1" onKeyDown={(e) => e.key === "Enter" && newItemName.trim() && addItem.mutate()} />
                  <Input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-16" min={1} />
                  <Select value={newItemPriority} onValueChange={setNewItemPriority}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="low">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="icon" onClick={() => newItemName.trim() && addItem.mutate()} disabled={!newItemName.trim()}><Plus className="h-4 w-4" /></Button>
                </div>

                {pendingRecurring.length > 0 && (
                  <div className="rounded-lg border border-accent/50 bg-accent/10 p-3 space-y-2">
                    <p className="text-xs font-medium text-accent-foreground flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Produtos recorrentes pendentes
                    </p>
                    {pendingRecurring.map((cat) => (
                      <div key={cat.canonical_name} className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{cat.canonical_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {cat.avg_price ? formatBRL(Number(cat.avg_price)) : "—"}
                            {cat.purchase_frequency_days && ` · ${FREQ_LABELS[cat.purchase_frequency_days] ?? `${cat.purchase_frequency_days}d`}`}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => addRecurringItem.mutate(cat)}>
                          <Plus className="h-3 w-3 mr-1" />Adicionar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {items?.map((item) => {
                  const cat = getItemCatalog(item.product_name);
                  const hasFreq = cat && cat.purchase_frequency_days;
                  const nextDate = hasFreq ? getNextPurchaseDate(cat.last_purchased_at, cat.purchase_frequency_days!) : null;
                  const urgent = nextDate && !item.is_checked ? isUrgent(nextDate) : false;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${item.is_checked ? "opacity-50" : ""} ${urgent ? "border border-destructive/40 bg-destructive/5" : ""}`}
                    >
                      <Checkbox checked={item.is_checked ?? false} onCheckedChange={(c) => toggleItem.mutate({ id: item.id, checked: !!c })} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm text-foreground ${item.is_checked ? "line-through" : ""}`}>{item.product_name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit}
                            {item.estimated_price ? ` · ${formatBRL(Number(item.estimated_price))}` : ""}
                          </p>
                          {nextDate && (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] ${urgent ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              <Calendar className="h-2.5 w-2.5" />
                              {urgent ? "Comprar hoje" : `Próx: ${formatShortDate(nextDate)}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasFreq && (
                          <Badge variant="outline" className="text-[10px] border-0 bg-accent/50 text-accent-foreground">
                            {FREQ_LABELS[cat.purchase_frequency_days!] ?? `${cat.purchase_frequency_days}d`}
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] border-0 ${PRIORITY_COLORS[item.priority ?? "medium"]}`}>
                          {PRIORITY_LABELS[item.priority ?? "medium"]}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteItem.mutate(item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {(!items || items.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">Nenhum item na lista.</p>}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Lista</DialogTitle>
            <DialogDescription>Produtos recorrentes serão adicionados automaticamente.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Ex: Compras da semana" value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newListName.trim() && createList.mutate(newListName.trim())} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewListOpen(false)}>Cancelar</Button>
            <Button onClick={() => newListName.trim() && createList.mutate(newListName.trim())} disabled={!newListName.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
