

# Integração Mercado Livre -- Comparativo Online

## Resumo

Adicionar Mercado Livre como fonte de comparação de preços online, usando Firecrawl para scraping da URL padrão do ML Supermercado, e exibir os resultados lado a lado com Amazon na página de Produtos e no Comparativo Online.

## 1. Nova Edge Function: `search-mercadolivre`

Criar `supabase/functions/search-mercadolivre/index.ts`:
- Recebe `{ product_name: string }`
- Normaliza o nome: lowercase, remove acentos, substitui espaços por `-`
- Monta URL: `https://lista.mercadolivre.com.br/supermercado/market/{nome-normalizado}_OrderId_PRICE_NoIndex_True?sb=storefront_url`
- Usa Firecrawl (JSON extraction primeiro, fallback markdown) para extrair até 5 produtos com título, preço e URL
- Retorna `{ success, results, search_url }`

Adicionar em `supabase/config.toml`:
```toml
[functions.search-mercadolivre]
verify_jwt = false
```

## 2. Migração: novas colunas em `product_catalog`

```sql
ALTER TABLE product_catalog
  ADD COLUMN ml_price numeric,
  ADD COLUMN ml_url text,
  ADD COLUMN ml_updated_at timestamptz;
```

## 3. Atualizar `ProductCatalog.tsx`

- Query do catálogo: incluir `ml_price, ml_url, ml_updated_at`
- Adicionar `handleRefreshMLPrice` (similar ao Amazon, chamando `search-mercadolivre`)
- Atualizar `OnlinePriceBadge` para exibir duas linhas: Amazon e Mercado Livre, cada uma com preço + badge percentual + timestamp
- `handleRefreshAll`: chamar ambas as funções sequencialmente para cada produto
- Desktop table: coluna "Online" mostra ambos os preços empilhados (Amazon / ML)

## 4. Atualizar `OnlineComparison.tsx`

- Adicionar função `searchMercadoLivre` similar à `searchAmazon`
- Manter estado separado por fonte (`comparisons` com chave `{nome}-amazon` e `{nome}-ml`)
- Exibir resultados de ambas as fontes no `ComparisonCard`, com abas ou seções lado a lado
- Botão de busca livre pesquisa em ambos simultaneamente

## Arquivos alterados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/search-mercadolivre/index.ts` | Criar (edge function) |
| `supabase/config.toml` | Adicionar config da função |
| Migração SQL | 3 novas colunas em `product_catalog` |
| `src/pages/ProductCatalog.tsx` | Exibir ML + Amazon lado a lado |
| `src/pages/OnlineComparison.tsx` | Busca e comparação com ML |

