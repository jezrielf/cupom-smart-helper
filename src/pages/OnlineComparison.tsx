import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ExternalLink, TrendingDown, TrendingUp, Minus, Globe, ShoppingCart, Loader2 } from "lucide-react";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface OnlineResult {
  title: string;
  price: number;
  url: string;
}

interface ComparisonState {
  loading: boolean;
  results: OnlineResult[];
  searchUrl?: string;
  error?: string;
}

type Source = "amazon" | "ml";

export default function OnlineComparison() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [comparisons, setComparisons] = useState<Record<string, ComparisonState>>({});

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ["product-catalog-online", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_catalog")
        .select("id, canonical_name, avg_price, min_price, max_price, category")
        .order("canonical_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = catalog?.filter(
    (p) => !search || p.canonical_name.toLowerCase().includes(search.toLowerCase())
  );

  const key = (name: string, source: Source) => `${name}::${source}`;

  const searchSource = async (productName: string, source: Source) => {
    const k = key(productName, source);
    setComparisons((prev) => ({ ...prev, [k]: { loading: true, results: [] } }));

    try {
      const fnName = source === "amazon" ? "search-amazon" : "search-mercadolivre";
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { product_name: productName },
      });

      if (error) throw error;

      if (data?.success) {
        setComparisons((prev) => ({
          ...prev,
          [k]: { loading: false, results: data.results ?? [], searchUrl: data.search_url },
        }));
      } else {
        setComparisons((prev) => ({
          ...prev,
          [k]: { loading: false, results: [], error: data?.error || "Erro ao buscar" },
        }));
      }
    } catch (e: any) {
      setComparisons((prev) => ({
        ...prev,
        [k]: { loading: false, results: [], error: e.message || "Erro ao buscar" },
      }));
    }
  };

  const searchBoth = async (productName: string) => {
    await Promise.all([
      searchSource(productName, "amazon"),
      searchSource(productName, "ml"),
    ]);
  };

  // Free-text search
  const [freeSearch, setFreeSearch] = useState("");
  const [freeSearching, setFreeSearching] = useState(false);
  const handleFreeSearch = async () => {
    const term = freeSearch.trim();
    if (!term) return;
    setFreeSearching(true);
    await searchBoth(term);
    setFreeSearching(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Comparativo Online</h1>
        <p className="text-muted-foreground text-sm">
          Compare preços do supermercado com Amazon e Mercado Livre
        </p>
      </div>

      {/* Free-text search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar qualquer produto online..."
                value={freeSearch}
                onChange={(e) => setFreeSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFreeSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleFreeSearch} disabled={!freeSearch.trim() || freeSearching}>
              {freeSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
              Buscar
            </Button>
          </div>

          {/* Free search results */}
          {(comparisons[key(freeSearch.trim(), "amazon")] || comparisons[key(freeSearch.trim(), "ml")]) && (
            <div className="mt-4">
              <ComparisonTabs
                productName={freeSearch.trim()}
                localPrice={null}
                amazonState={comparisons[key(freeSearch.trim(), "amazon")]}
                mlState={comparisons[key(freeSearch.trim(), "ml")]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter catalog */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filtrar produtos do catálogo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {catalogLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {filtered && filtered.length === 0 && !catalogLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Nenhum produto encontrado no catálogo.</p>
            <p className="text-xs mt-1">Use a busca livre acima para pesquisar qualquer produto.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered?.map((product) => {
          const amazonState = comparisons[key(product.canonical_name, "amazon")];
          const mlState = comparisons[key(product.canonical_name, "ml")];
          const isLoading = amazonState?.loading || mlState?.loading;
          const hasResults = amazonState?.results?.length || mlState?.results?.length;

          return (
            <Card key={product.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-foreground">{product.canonical_name}</p>
                    {product.category && (
                      <Badge variant="outline" className="text-xs mt-1">
                        {product.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {product.avg_price && (
                      <span className="text-sm text-muted-foreground">
                        Supermercado: <span className="font-semibold text-foreground">{formatBRL(product.avg_price)}</span>
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant={hasResults ? "outline" : "default"}
                      onClick={() => searchBoth(product.canonical_name)}
                      disabled={!!isLoading}
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      {isLoading ? "Buscando..." : hasResults ? "Atualizar" : "Comparar"}
                    </Button>
                  </div>
                </div>

                {(amazonState || mlState) && (
                  <ComparisonTabs
                    productName={product.canonical_name}
                    localPrice={product.avg_price}
                    amazonState={amazonState}
                    mlState={mlState}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonTabs({
  productName,
  localPrice,
  amazonState,
  mlState,
}: {
  productName: string;
  localPrice: number | null;
  amazonState?: ComparisonState;
  mlState?: ComparisonState;
}) {
  return (
    <Tabs defaultValue="amazon" className="mt-3">
      <TabsList className="h-8">
        <TabsTrigger value="amazon" className="text-xs px-3 py-1">
          Amazon {amazonState?.results?.length ? `(${amazonState.results.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="ml" className="text-xs px-3 py-1">
          Mercado Livre {mlState?.results?.length ? `(${mlState.results.length})` : ""}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="amazon">
        <SourceResults localPrice={localPrice} state={amazonState} sourceName="Amazon" />
      </TabsContent>
      <TabsContent value="ml">
        <SourceResults localPrice={localPrice} state={mlState} sourceName="Mercado Livre" />
      </TabsContent>
    </Tabs>
  );
}

function SourceResults({
  localPrice,
  state,
  sourceName,
}: {
  localPrice: number | null;
  state?: ComparisonState;
  sourceName: string;
}) {
  if (!state) {
    return <p className="text-sm text-muted-foreground py-2">Clique em "Comparar" para buscar no {sourceName}.</p>;
  }

  if (state.loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
        {state.error}
      </div>
    );
  }

  if (state.results.length === 0) {
    return (
      <div className="p-3 rounded-lg bg-muted text-muted-foreground text-sm">
        Nenhum resultado encontrado no {sourceName}.
        {state.searchUrl && (
          <a
            href={state.searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-primary hover:underline inline-flex items-center gap-1"
          >
            Ver busca <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  const cheapest = state.results[0];

  return (
    <div className="space-y-2">
      {localPrice && (
        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground mb-1">Supermercado</p>
            <p className="text-lg font-bold text-foreground">{formatBRL(localPrice)}</p>
          </div>

          <div className="text-center">
            {(() => {
              const diff = ((cheapest.price - localPrice) / localPrice) * 100;
              const isOnlineCheaper = diff < 0;
              const isSame = Math.abs(diff) < 1;

              if (isSame) {
                return (
                  <Badge variant="secondary" className="gap-1">
                    <Minus className="h-3 w-3" />
                    ~igual
                  </Badge>
                );
              }

              return (
                <Badge
                  className={`gap-1 ${
                    isOnlineCheaper
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                  }`}
                >
                  {isOnlineCheaper ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
                  {Math.abs(diff).toFixed(0)}% {isOnlineCheaper ? "mais barato" : "mais caro"}
                </Badge>
              );
            })()}
          </div>

          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground mb-1">{sourceName}</p>
            <p className="text-lg font-bold text-primary">{formatBRL(cheapest.price)}</p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {state.results.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 p-2 rounded-md bg-background border text-sm"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-foreground">{r.title}</p>
            </div>
            <span className="font-semibold text-foreground whitespace-nowrap">
              {formatBRL(r.price)}
            </span>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 shrink-0"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        ))}
      </div>

      {state.searchUrl && (
        <a
          href={state.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Ver todos no {sourceName} <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
