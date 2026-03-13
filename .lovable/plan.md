

# Fix: Preços incorretos e links genéricos na Amazon e Mercado Livre

## Problema

Dois problemas identificados nos logs:

1. **ML retorna 0 resultados**: A busca `"esponja la aco assolan 45g site:mercadolivre.com.br"` retorna 5 resultados do Firecrawl, mas **nenhum** passa o filtro `url.includes('mercadolivre.com.br')`. O operador `site:` não está funcionando de forma confiável.

2. **Preço mínimo errado**: `extractPriceFromMarkdown` usa `Math.min(...)` sobre todos os preços encontrados no markdown. Se o markdown contém preços de vários produtos (página de listagem), pega o menor de todos — que pode ser de um produto completamente diferente (ex: R$ 3,99 de frete ou de outro item).

3. **Links genéricos**: O `search_url` final é montado manualmente como URL de busca (`lista.mercadolivre.com.br/...`), não é a URL real do produto.

## Solução

### 1. Remover `site:` da query e filtrar por domínio depois

O Firecrawl Search já aceita `lang: 'pt-br'` e `country: 'br'`. Buscar pelo nome do produto + marketplace no query text (ex: `"esponja aço assolan mercadolivre"`) e depois filtrar URLs por domínio nos resultados.

### 2. Priorizar URLs de páginas de produto

- **ML**: URLs que contêm `/p/ML` são páginas de produto individual
- **Amazon**: URLs que contêm `/dp/` são páginas de produto individual
- Rejeitar URLs de busca/listagem (contêm `/s?`, `/b/`, etc.)

### 3. Melhor extração de preço

Em vez de pegar o menor preço de todo o markdown (que pode ter dezenas de preços de produtos diferentes), extrair o **primeiro** preço `R