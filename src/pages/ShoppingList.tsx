import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import FrequencySection from "@/components/shopping-list/FrequencySection";
import ManualSection from "@/components/shopping-list/ManualSection";

const FREQ_ORDER = [15, 30, 60, 90];
const FREQ_NAMES: Record<number, string> = { 15: "Compras Quinzenais", 30: "Compras Mensais", 60: "Compras Bimestrais", 90: "Compras Trimestrais" };

export type CatalogItem = {
  canonical_name: string;
  purchase_frequency_days: number | null;
  last_purchased_at: string | null;
  avg_price: number | null;
  unit: string | null;
};

export type ShoppingList = {
  id: string;
  user_id: string;
  name: string;
  frequency_days: number | null;
  planned_date: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  target_supermarket_id: string | null;
};

export type ShoppingItem = {
  id: string;
  shopping_list_id: string;
  user_id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  estimated_price: number | null;
  is_checked: boolean | null;
  priority: string | null;
  note: string | null;
  product_catalog_id: string | null;
  created_at: string;
  updated_at: string;
};

export default function ShoppingList() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Fetch all catalog items with recurrence
  const { data: catalogData } = useQuery({
    queryKey: ["product-catalog-recurrence"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_catalog")
        .select("canonical_name, purchase_frequency_days, last_purchased_at, avg_price, unit")
        .not("purchase_frequency_days", "is", null);
      if (error) throw error;
      return data as CatalogItem[];
    },
  });

  // Fetch user's shopping lists
  const { data: lists, isLoading: listsLoading } = useQuery({
    queryKey: ["shopping-lists", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ShoppingList[];
    },
  });

  // Fetch all items across all lists
  const listIds = useMemo(() => lists?.map((l) => l.id) ?? [], [lists]);
  const { data: allItems } = useQuery({
    queryKey: ["shopping-items-all", listIds],
    enabled: listIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("*")
        .in("shopping_list_id", listIds)
        .order("is_checked")
        .order("product_name");
      if (error) throw error;
      return data as ShoppingItem[];
    },
  });

  // Group catalog items by frequency
  const freqGroups = useMemo(() => {
    const map = new Map<number, CatalogItem[]>();
    catalogData?.forEach((c) => {
      if (!c.purchase_frequency_days) return;
      const arr = map.get(c.purchase_frequency_days) || [];
      arr.push(c);
      map.set(c.purchase_frequency_days, arr);
    });
    return map;
  }, [catalogData]);

  // Distinct frequencies present
  const activeFreqs = useMemo(() => {
    return FREQ_ORDER.filter((f) => freqGroups.has(f));
  }, [freqGroups]);

  // Auto-create shopping lists per frequency
  const autoCreateLists = useMutation({
    mutationFn: async (freqs: number[]) => {
      const existingFreqs = new Set(lists?.filter((l) => l.frequency_days).map((l) => l.frequency_days));
      const missing = freqs.filter((f) => !existingFreqs.has(f));
      if (missing.length === 0) return;

      const toInsert = missing.map((f) => ({
        user_id: user!.id,
        name: FREQ_NAMES[f] ?? `Cada ${f} dias`,
        frequency_days: f,
      }));
      const { error } = await supabase.from("shopping_lists").insert(toInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  // Auto-sync: add missing catalog items to their frequency list
  const autoSyncItems = useCallback(async () => {
    if (!lists || !catalogData) return;
    for (const freq of activeFreqs) {
      const list = lists.find((l) => l.frequency_days === freq);
      if (!list) continue;
      const existingNames = new Set(
        allItems?.filter((i) => i.shopping_list_id === list.id).map((i) => i.product_name.toLowerCase()) ?? []
      );
      const catalogItems = freqGroups.get(freq) ?? [];
      const toAdd = catalogItems.filter((c) => !existingNames.has(c.canonical_name.toLowerCase()));
      if (toAdd.length === 0) continue;
      const rows = toAdd.map((c) => ({
        shopping_list_id: list.id,
        user_id: user!.id,
        product_name: c.canonical_name,
        quantity: 1,
        unit: c.unit ?? "UN",
        estimated_price: c.avg_price ? Number(c.avg_price) : null,
        priority: "medium",
      }));
      await supabase.from("shopping_list_items").insert(rows);
    }
    qc.invalidateQueries({ queryKey: ["shopping-items-all"] });
  }, [lists, catalogData, allItems, activeFreqs, freqGroups, user, qc]);

  // Run auto-create once when data is ready
  useEffect(() => {
    if (!user || !catalogData || !lists) return;
    if (activeFreqs.length > 0) {
      const existingFreqs = new Set(lists.filter((l) => l.frequency_days).map((l) => l.frequency_days));
      const missing = activeFreqs.filter((f) => !existingFreqs.has(f));
      if (missing.length > 0) {
        autoCreateLists.mutate(missing);
      }
    }
  }, [user, catalogData, lists, activeFreqs]);

  // Auto-sync items after lists exist
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (synced || !lists || !catalogData || !allItems) return;
    const existingFreqs = new Set(lists.filter((l) => l.frequency_days).map((l) => l.frequency_days));
    const allPresent = activeFreqs.every((f) => existingFreqs.has(f));
    if (allPresent && activeFreqs.length > 0) {
      autoSyncItems().then(() => setSynced(true));
    }
  }, [lists, catalogData, allItems, activeFreqs, synced, autoSyncItems]);

  // Get the "Outros" list (manual, no frequency)
  const manualList = useMemo(() => lists?.find((l) => !l.frequency_days), [lists]);
  const manualItems = useMemo(
    () => allItems?.filter((i) => manualList && i.shopping_list_id === manualList.id) ?? [],
    [allItems, manualList]
  );

  // Update planned_date mutation
  const updatePlannedDate = useMutation({
    mutationFn: async ({ listId, date }: { listId: string; date: string | null }) => {
      const { error } = await supabase.from("shopping_lists").update({ planned_date: date }).eq("id", listId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-lists"] });
      toast.success("Data atualizada");
    },
  });

  if (listsLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Lista de Compras</h1>
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const hasAnyContent = activeFreqs.length > 0 || (manualItems && manualItems.length > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Lista de Compras</h1>

      {!hasAnyContent ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <ShoppingCart className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nenhum produto com recorrência configurada. Vá em <strong>Produtos</strong> e defina a frequência de compra.
          </p>
        </div>
      ) : (
        <>
          {activeFreqs.map((freq) => {
            const list = lists?.find((l) => l.frequency_days === freq);
            const items = list ? allItems?.filter((i) => i.shopping_list_id === list.id) ?? [] : [];
            const catalogItems = freqGroups.get(freq) ?? [];

            return (
              <FrequencySection
                key={freq}
                freq={freq}
                freqName={FREQ_NAMES[freq] ?? `Cada ${freq} dias`}
                list={list ?? null}
                items={items}
                catalogItems={catalogItems}
                userId={user!.id}
                onUpdatePlannedDate={(listId, date) => updatePlannedDate.mutate({ listId, date })}
              />
            );
          })}

          <ManualSection
            list={manualList ?? null}
            items={manualItems}
            userId={user!.id}
          />
        </>
      )}
    </div>
  );
}
