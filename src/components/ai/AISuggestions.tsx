import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  TrendingDown,
  TrendingUp,
  Clock,
  ShoppingCart,
  Loader2,
  X,
} from "lucide-react";

export interface AISuggestion {
  type: "price_alert" | "cheaper_alternative" | "forgotten_product" | "best_time_to_buy";
  message: string;
  product_name: string;
}

interface AISuggestionsProps {
  suggestions: AISuggestion[];
  loading?: boolean;
  onDismiss?: (index: number) => void;
  onRefresh?: () => void;
}

const typeConfig: Record<
  AISuggestion["type"],
  { icon: React.ElementType; label: string; color: string }
> = {
  price_alert: {
    icon: TrendingUp,
    label: "Alerta de Preço",
    color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  },
  cheaper_alternative: {
    icon: TrendingDown,
    label: "Alternativa",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  forgotten_product: {
    icon: ShoppingCart,
    label: "Esquecido",
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  best_time_to_buy: {
    icon: Clock,
    label: "Melhor Momento",
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
};

export function AISuggestions({ suggestions, loading, onDismiss, onRefresh }: AISuggestionsProps) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const visible = suggestions.filter((_, i) => !dismissed.has(i));

  if (loading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Sugestões Inteligentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Analisando seus dados...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (visible.length === 0) return null;

  const handleDismiss = (index: number) => {
    setDismissed((prev) => new Set(prev).add(index));
    onDismiss?.(index);
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Sugestões Inteligentes
          </CardTitle>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 text-xs">
              Atualizar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((s, idx) => {
          const originalIdx = suggestions.indexOf(s);
          const cfg = typeConfig[s.type];
          const Icon = cfg.icon;
          return (
            <div
              key={originalIdx}
              className="flex items-start gap-3 rounded-lg bg-accent/50 p-3 group"
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
                    {cfg.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">{s.product_name}</span>
                </div>
                <p className="text-sm text-foreground leading-snug">{s.message}</p>
              </div>
              <button
                onClick={() => handleDismiss(originalIdx)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
