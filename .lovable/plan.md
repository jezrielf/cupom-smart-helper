

# Adicionar iFood como fonte de comparação de preços

## Resumo

Adicionar iFood como terceira fonte de preços online, seguindo o mesmo padrão de Amazon e Mercado Livre.

## 1. Nova Edge Function: `search-ifood`

Criar `supabase/functions/search-ifood/index.ts`:
- Recebe `{ product_name: string }`
- Reutiliza a mesma lógica de `normalizeForSearch` (abbreviation map, packaging codes, etc.)
- Monta URL: `https://www.ifood.com.br/busca?q={nome%20normalizado}&sort=price_range%3Aasc&term={nome}`
  - Espaços codificados como `%20` (encodeURIComponent)
  - `sort=price_range:asc` fixo
  - `term` com o nome normalizado
- Usa Firecrawl (extract + markdown fallback) para extrair até 5 produtos
- Retorna `{ success, results, search_url }`

Adicionar em `supabase/config.toml`:
```toml
[functions.search-ifood]
verify_jwt = false
```

## 2. Migração: novas colunas em `product_catalog`

```sql
ALTER TABLE public.product_catalog
  ADD COLUMN ifood_price numeric,
  ADD COLUMN ifood_url text,
  ADD COLUMN ifood_updated_at timestamptz;
```

## 3. Atualizar `ProductCatalog.tsx`

- Query do catálogo: incluir `ifood_price, ifood_url, ifood_updated_at`
- Adicionar state `refreshingIfood` (Set)
- Adicionar `handleRefreshIfoodPrice` (mesma estrutura do ML/Amazon, chamando `search-ifood`)
- `OnlinePriceBadge`: adicionar terceira `PriceLine` com label "iFood"
- `handleRefreshAll`: chamar as 3 funções sequencialmente para cada produto

## 4. Atualizar `OnlineComparison.tsx`

- Adicionar aba "iFood" no `ComparisonTabs`
- Busca livre pesquisa nas 3 fontes simultaneamente

## Arquivos alterados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/search-ifood/index.ts` | Criar |
| `supabase/config.toml` | Adicionar config |
| Migração SQL | 3 colunas em `product_catalog` |
| `src/pages/ProductCatalog.tsx` | Exibir iFood + refresh |
| `src/pages/OnlineComparison.tsx` | Aba iFood |

