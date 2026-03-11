import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Trash2, Calendar as CalendarIcon, AlertTriangle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ShoppingList, ShoppingItem, CatalogItem } from "@/pages/ShoppingList";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

interface FrequencySectionProps {
  freq: number;
  freqName: string;
  list: ShoppingList | null;
  items: ShoppingItem[];
  catalogItems: CatalogItem[];
  userId: string;
  onUpdatePlannedDate: (listId: string, date: string | null) => void;
}

export default function FrequencySection({
  freq,
  freqName,
  list,
  items,
  catalogItems,
  userId,
  onUpdatePlannedDate,
}: FrequencySectionProps) {
  const qc = useQueryClient();
  const [newItemName, setNewItemName] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Compute predicted date from catalog or list
  const computedDate = (() => {
    if (list?.planned_date) return new Date(list.planned_date + "T00:00:00");
    // Max last_purchased_at + freq
    let maxDate: Date | null = null;
    catalogItems.forEach((c) => {
      if (c.last_purchased_at) {
        const d = new Date(c.last_purchased_at);
        if (!maxDate || d > maxDate) maxDate = d;
      }
    });
    if (maxDate) {
      const next = new Date(maxDate);
      next.setDate(next.getDate() + freq);
      return next;
    }
    return new Date();
  })();

  const urgent = isUrgent(computedDate);
  const estimatedTotal = items.reduce((s, i) => s + (Number(i.estimated_price) || 0) * (Number(i.quantity) || 1), 0);
  const checkedCount = items.filter((i) => i.is_checked).length;

  const toggleItem = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      await supabase.from("shopping_list_items").update({ is_checked: checked }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping-items-all"] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("shopping_list_items").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping-items-all"] }),
  });

  const addItem = useMutation({
    mutationFn: async (name: string) => {
      if (!list) return;
      await supabase.from("shopping_list_items").insert({
        shopping_list_id: list.id,
        user_id: userId,
        product_name: name,
        quantity: 1,
        priority: "medium",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-items-all"] });
      setNewItemName("");
    },
  });

  const handleDateSelect = (date: Date | undefined) => {
    if (!list || !date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    onUpdatePlannedDate(list.id, dateStr);
    setDatePickerOpen(false);
  };

  const clearFixedDate = () => {
    if (!list) return;
    onUpdatePlannedDate(list.id, null);
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{freqName}</h2>
              <Badge variant="outline" className="text-xs">
                {checkedCount}/{items.length}
              </Badge>
            </div>
            {estimatedTotal > 0 && (
              <span className="text-base font-semibold text-primary">
                {formatBRL(estimatedTotal)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <CalendarIcon className={cn("h-4 w-4", urgent ? "text-destructive" : "text-muted-foreground")} />
            <span className={cn("text-sm", urgent ? "text-destructive font-medium" : "text-muted-foreground")}>
              {urgent ? "Compra prevista para hoje!" : `Próxima compra: ${format(computedDate, "dd/MM/yyyy")}`}
            </span>
            {list?.planned_date && (
              <Badge variant="secondary" className="text-[10px]">Fixada</Badge>
            )}
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Pencil className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={computedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                  locale={ptBR}
                />
                {list?.planned_date && (
                  <div className="p-2 border-t border-border">
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={clearFixedDate}>
                      Usar data automática
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => {
          const cat = catalogItems.find((c) => c.canonical_name.toLowerCase() === item.product_name.toLowerCase());
          const nextDate = cat?.last_purchased_at
            ? getNextPurchaseDate(cat.last_purchased_at, freq)
            : null;
          const itemUrgent = nextDate && !item.is_checked ? isUrgent(nextDate) : false;

          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-lg p-2 transition-colors",
                item.is_checked && "opacity-50",
                itemUrgent && "border border-destructive/40 bg-destructive/5"
              )}
            >
              <Checkbox
                checked={item.is_checked ?? false}
                onCheckedChange={(c) => toggleItem.mutate({ id: item.id, checked: !!c })}
              />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm text-foreground", item.is_checked && "line-through")}>
                  {item.product_name}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit ?? "UN"}
                    {item.estimated_price ? ` · ${formatBRL(Number(item.estimated_price))}` : ""}
                  </span>
                  {nextDate && (
                    <span className={cn(
                      "inline-flex items-center gap-0.5 text-[10px]",
                      itemUrgent ? "text-destructive font-medium" : "text-muted-foreground"
                    )}>
                      <CalendarIcon className="h-2.5 w-2.5" />
                      {itemUrgent ? "Comprar hoje" : `Próx: ${formatShortDate(nextDate)}`}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive shrink-0"
                onClick={() => deleteItem.mutate(item.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">Nenhum item nesta seção.</p>
        )}

        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Adicionar produto..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && newItemName.trim() && addItem.mutate(newItemName.trim())}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => newItemName.trim() && addItem.mutate(newItemName.trim())}
            disabled={!newItemName.trim()}
          >
            <Plus className="h-3 w-3 mr-1" />Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
