import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ExternalLink, TrendingDown, TrendingUp, Minus, Globe, ShoppingCart } from "lucide-react";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface AmazonResult {
  title: string;
  price: number;
  url: string;
}

interface ComparisonState {
  loading: boolean;
  results: AmazonResult[];
  searchUrl?: string;
  error?: string;
}

export default function OnlineComparison() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [comparisons, setComparisons] = useState<Record<string, ComparisonState>>({});

  // Load user products from catalog with avg_price
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
    (p) =>
      !search ||
      p.canonical_name.toLowerCase().includes(search.toLowerCase())
  );

  const searchAmazon = async (productName: string) => {
    setComparisons((prev) => ({
      ...prev,
      [productName]: { loading: true, results: [] },
    }));

    try {
      const { data, error } = await supabase.functions.invoke("search-amazon", {
        body: { product_name: productName },
      });

      if (error) throw error;

      if (data?.success) {
        setComparisons((prev) => ({
          ...prev,
          [productName]: {
            loading: false,
            results: data.results ?? [],
            searchUrl: data.search_url,
          },
        }));
      } else {
        setComparisons((prev) => ({
          ...prev,
          [productName]: {
            loading: false,
            results: [],
            error: data?.error || "Erro ao buscar",
          },
        }));
      }
    } catch (e: any) {
      setComparisons((prev) => ({
        ...prev,
        [productName]: {
          loading: false,
          results: [],
          error: e.message || "Erro ao buscar",
        },
      }));
    }
  };

  // Free-text search
  const [freeSearch, setFreeSearch] = useState("");
  const handleFreeSearch = () => {
    if (freeSearch.trim()) {
      searchAmazon(freeSearch.trim());
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Comparativo Online</h1>
        <p className="text-muted-foreground text-sm">
          Compare preços do supermercado com a Amazon Brasil
        </p>
      </div>

      {/* Free-text search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar qualquer produto na Amazon..."
                value={freeSearch}
                onChange={(e) => setFreeSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFreeSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleFreeSearch} disabled={!freeSearch.trim()}>
              <Globe className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </div>

          {/* Free search result */}
          {comparisons[freeSearch.trim()] && (
            <div className="mt-4">
              <ComparisonCard
                productName={freeSearch.trim()}
                localPrice={null}
                state={comparisons[freeSearch.trim()]}
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
          const state = comparisons[product.canonical_name];
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
                      variant={state?.results?.length ? "outline" : "default"}
                      onClick={() => searchAmazon(product.canonical_name)}
                      disabled={state?.loading}
                    >
                      {state?.loading ? "Buscando..." : state?.results?.length ? "Atualizar" : "Comparar"}
                    </Button>
                  </div>
                </div>

                {state && (
                  <ComparisonCard
                    productName={product.canonical_name}
                    localPrice={product.avg_price}
                    state={state}
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

function ComparisonCard({
  productName,
  localPrice,
  state,
}: {
  productName: string;
  localPrice: number | null;
  state: ComparisonState;
}) {
  if (state.loading) {
    return (
      <div className="mt-3 space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
        {state.error}
      </div>
    );
  }

  if (state.results.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-muted text-muted-foreground text-sm">
        Nenhum resultado encontrado na Amazon.
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
    <div className="mt-3 space-y-2">
      {/* Main comparison */}
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
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
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
            <p className="text-xs text-muted-foreground mb-1">Amazon</p>
            <p className="text-lg font-bold text-primary">{formatBRL(cheapest.price)}</p>
          </div>
        </div>
      )}

      {/* All results */}
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
          Ver todos na Amazon <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
