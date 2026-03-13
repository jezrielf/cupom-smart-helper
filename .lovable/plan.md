

# Melhorias baseadas no documento de inteligência

## Problema atual

As Edge Functions `search-amazon` e `search-mercadolivre` usam **regex para extrair preços do markdown** retornado pelo Firecrawl Search. Isso causa:
- Preços incorretos (captura preço de frete, parcela, ou outro produto na página)
- Links que podem ser de páginas de listagem em vez de produto individual

## Solução: Firecrawl JSON Extraction nas páginas de produto

Reescrever as Edge Functions para usar uma estratégia em 2 etapas conforme o documento:

### Etapa 1: Search para encontrar URLs de produto
Usar `/v1/search` (1 crédito) para encontrar URLs reais de produto (`/dp/` na Amazon, `/p/MLB` no ML).

### Etapa 2: Scrape com JSON schema na página do produto
Usar `/v1/scrape` com `formats: ["extract"]` e um schema estruturado (5 créditos) na URL do produto encontrada. O Firecrawl usa IA para extrair campos tipados, eliminando regex.

### Mudanças por arquivo:

**1. `supabase/functions/search-amazon/index.ts`**
- Manter normalização e volume matching existentes
- Search: buscar `"{query} site:amazon.com.br"` com `limit: 5`, sem `scrapeOptions`
- Filtrar resultados por domínio `amazon.com.br` e URLs de produto (`/dp/`)
- Para o melhor resultado (até 3): chamar `/v1/scrape` com schema JSON:
  ```
  { titulo, preco_atual, url_produto, marca, peso }
  ```
- Usar `prompt` para instruir extração do preço principal (não parcela, não frete)
- Fallback: se scrape falhar, tentar `extractFirstPrice` do markdown do search (como hoje)

**2. `supabase/functions/search-mercadolivre/index.ts`**
- Mesma estratégia: Search → filtrar `/p/ML` → Scrape com JSON schema
- Schema ML: `{ titulo, preco_atual, url_produto, frete_gratis, vendedor }`
- Adicionar `waitFor: 2500` no scrape (ML usa JS pesado)
- Fallback: regex no markdown se scrape falhar

**3. `supabase/config.toml`**
- Adicionar config para `search-amazon` (verify_jwt = false, se não existir)

### Custo Firecrawl
- Antes: 1 crédito por produto (search com markdown)
- Depois: 1 (search) + 5 (scrape) = 6 créditos por produto na Amazon, 6 no ML
- Tradeoff: mais caro, mas preços e links corretos

### O que NÃO muda
- Contrato de resposta `{ success, results: [{ title, price, url }], search_url }` mantido
- Frontend (`OnlineComparison.tsx`, `ProductCatalog.tsx`) sem alterações
- NFC-e já funciona bem com a abordagem atual
- Normalização de nomes e volume matching mantidos

