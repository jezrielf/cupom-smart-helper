import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AISuggestion } from "@/components/ai/AISuggestions";

interface NormalizedProduct {
  original_name: string;
  canonical_name: string;
  brand?: string | null;
  weight_g?: number | null;
  category?: string | null;
}

interface CatalogMatch {
  product_name: string;
  matched_catalog_id: string;
  matched_catalog_name?: string;
  confidence: number;
}

interface AIAnalysisResult {
  normalized_products: NormalizedProduct[];
  catalog_matches: CatalogMatch[];
  suggestions: AISuggestion[];
}

export function useAIProductIntelligence() {
  const [analyzing, setAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<AIAnalysisResult | null>(null);

  const analyze = async (
    products: Array<{ product_name: string; product_name_normalized: string; unit_price: number; quantity: number; unit?: string | null }>,
    options?: { showToasts?: boolean }
  ): Promise<AIAnalysisResult | null> => {
    if (products.length === 0) return null;
    setAnalyzing(true);

    try {
      // Fetch existing catalog for matching
      const { data: catalog } = await supabase
        .from("product_catalog")
        .select("id, canonical_name, brand, ai_category, avg_price, aliases");

      // Fetch price history summary (last 3 months, grouped)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const { data: priceHistory } = await supabase
        .from("price_history")
        .select("product_name_normalized, unit_price, purchase_date, supermarket_id")
        .gte("purchase_date", threeMonthsAgo.toISOString())
        .order("purchase_date", { ascending: false })
        .limit(500);

      const { data, error } = await supabase.functions.invoke("ai-product-intelligence", {
        body: {
          products: products.map((p) => ({
            product_name: p.product_name,
            product_name_normalized: p.product_name_normalized,
            unit_price: p.unit_price,
            quantity: p.quantity,
            unit: p.unit,
          })),
          catalog: (catalog || []).map((c) => ({
            id: c.id,
            canonical_name: c.canonical_name,
            brand: c.brand,
            category: c.ai_category,
            aliases: c.aliases,
          })),
          price_history_summary: priceHistory || [],
        },
      });

      if (error) {
        console.error("AI analysis error:", error);
        if (options?.showToasts) toast.error("Erro na análise de IA");
        return null;
      }

      const result = data as AIAnalysisResult;
      setLastResult(result);

      // Update product_catalog with AI data
      if (result.normalized_products?.length) {
        for (const np of result.normalized_products) {
          const updateData: Record<string, any> = {};
          if (np.brand) updateData.brand = np.brand;
          if (np.weight_g) updateData.weight_g = np.weight_g;
          if (np.category) updateData.ai_category = np.category;

          if (Object.keys(updateData).length > 0) {
            const { data: existing } = await supabase
              .from("product_catalog")
              .select("id")
              .eq("canonical_name", np.original_name)
              .maybeSingle();

            if (existing) {
              await supabase.from("product_catalog").update(updateData).eq("id", existing.id);
            } else {
              // Try matching by canonical name
              const { data: byCanonical } = await supabase
                .from("product_catalog")
                .select("id")
                .eq("canonical_name", np.canonical_name)
                .maybeSingle();

              if (byCanonical) {
                await supabase.from("product_catalog").update(updateData).eq("id", byCanonical.id);
              } else {
                await supabase.from("product_catalog").insert({
                  canonical_name: np.canonical_name,
                  ...updateData,
                });
              }
            }
          }
        }
      }

      if (options?.showToasts && result.suggestions?.length > 0) {
        toast.info(`IA encontrou ${result.suggestions.length} sugestão(ões) para você`, {
          duration: 5000,
        });
      }

      return result;
    } catch (err) {
      console.error("AI analysis failed:", err);
      if (options?.showToasts) toast.error("Erro ao analisar produtos com IA");
      return null;
    } finally {
      setAnalyzing(false);
    }
  };

  return { analyze, analyzing, lastResult };
}
