import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShoppingList, ShoppingItem } from "@/pages/ShoppingList";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ManualSectionProps {
  list: ShoppingList | null;
  items: ShoppingItem[];
  userId: string;
}

export default function ManualSection({ list, items, userId }: ManualSectionProps) {
  const qc = useQueryClient();
  const [newItemName, setNewItemName] = useState("");

  const ensureList = async (): Promise<string> => {
    if (list) return list.id;
    const { data, error } = await supabase
      .from("shopping_lists")
      .insert({ user_id: userId, name: "Outros (avulsos)" })
      .select()
      .single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["shopping-lists"] });
    return data.id;
  };

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
      const listId = await ensureList();
      await supabase.from("shopping_list_items").insert({
        shopping_list_id: listId,
        user_id: userId,
        product_name: name,
        quantity: 1,
        priority: "medium",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-items-all"] });
      qc.invalidateQueries({ queryKey: ["shopping-lists"] });
      setNewItemName("");
    },
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Outros (avulsos)</h2>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-lg p-2 transition-colors",
              item.is_checked && "opacity-50"
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
              <span className="text-xs text-muted-foreground">
                {item.quantity} {item.unit ?? "UN"}
                {item.estimated_price ? ` · ${formatBRL(Number(item.estimated_price))}` : ""}
              </span>
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
        ))}

        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">Nenhum item avulso.</p>
        )}

        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Adicionar produto avulso..."
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
