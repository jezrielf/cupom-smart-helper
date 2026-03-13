

# Fix: Preços imprecisos e links errados na Amazon e Mercado Livre

## Problema raiz

A abordagem atual **scrapa páginas de listagem de busca** (ex: `amazon.com.br/s?k=...`) e usa extração LLM (Firecrawl `extract`) para interpretar os resultados. Isso causa dois problemas:

1. **Preços inventados**: O LLM pode interpretar preços errados da página de listagem (preço de outro produto, preço parcelado, preço sem frete, etc.)
2. **Links de busca, não de produto**: As URLs retornadas são da página de busca, não da página individual do produto

## Solução: Usar Firecrawl Search API + Scrape da página do produto

Em vez de scraping de páginas de listagem, usar uma abordagem em 2 etapas:

### Etapa 1: Firecrawl `/v1/search` para encontrar o produto
Fazer uma busca web com `site:amazon.com.br` ou `site:mercadolivre.com.br` para obter URLs reais de páginas de produto.

```
POST /v1/search
{ 
  query: "antissep