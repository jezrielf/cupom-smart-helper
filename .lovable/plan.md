

# Fix: Mercado Livre Search -- Better Name Normalization + Feedback

## Problem

The edge function works correctly (200 responses), but many products return 0 results because the search URL contains receipt abbreviations like `PC`, `PT`, `GL`, `TP`, `SC`, `LT`, `FR`, `UN`, `KG`, `ML`, `GR`, `G`, weight/volume patterns (`500G`, `1KG`, `900ML`), and brand codes (`T1`, `N8`, `LT1`).

Examples from logs:
- `"CR LEITE CAMPONESA TP 200G"` → 0 results (should search "creme leite camponesa")
- `"MAC ESPAG STA AMALIA N8 PC 750G OVOS"` → 0 results
- `"MILHO VERDE MINAS MAIS SC 170G"` → 0 results

## Changes

### 1. `supabase/functions/search-mercadolivre/index.ts` -- Improve `normalizeForSearch`

Strip common receipt abbreviations and unit/weight patterns before building the URL:
- Remove packaging: `PC`, `PT`, `GL`, `FR`, `SC`, `TP`, `GR`, `CX`, `FD`, `BD`, `LT`, `UN`
- Remove weight/volume: patterns like `500G`, `1KG`, `900ML`, `200G`, `300ML`
- Remove size codes: `T1`, `N8`, `LT1`, `N5`
- Expand common abbreviations: `MAC` → `macarrao`, `CR` → `creme`, `TOM` → `tomate`, `ESPAG` → `espaguete`, `STA` → `santa`, `ABS` → `absorvente`
- Collapse multiple hyphens after stripping

### 2. `src/pages/ProductCatalog.tsx` -- Add feedback on zero results

When `handleRefreshMLPrice` gets `results.length === 0`, show a brief toast: "Nenhum resultado encontrado no Mercado Livre para [product]" so the user knows a search happened.

Same for `handleRefreshOnlinePrice` (Amazon).

### 3. `supabase/functions/search-mercadolivre/index.ts` -- Fallback broader search

If the `/supermercado/market/` URL returns 0 results, try a broader ML search URL without the `/supermercado/market/` prefix:
`https://lista.mercadolivre.com.br/{normalized}_OrderId_PRICE_NoIndex_True`

## No database changes needed

