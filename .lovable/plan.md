

# Fix: Mercado Livre (e Amazon) -- Firecrawl JSON Extraction Retornando 400

## Problema Identificado

Os logs mostram que **todas** as chamadas de JSON extraction retornam status 400 -- tanto no `search-mercadolivre` quanto no `search-amazon`. O formato `formats: [{ type: 'json', schema: {...} }]` usado no body da request esta incorreto para a API REST do Firecrawl v1.

A API REST espera:
```json
{
  "formats": ["extract"],
  "extract": { "schema": {...}, "prompt": "..." }
}
```

O fallback de markdown funciona em alguns casos (encontrou 5 resultados para "ABS INTERNO INTIMUS 8UN MEDIO") mas falha em outros, possivelmente porque os nomes de produtos sao muito abreviados/especificos para gerar resultados na pagina do ML.

## Correções

### 1. `supabase/functions/search-mercadolivre/index.ts`
- Corrigir formato da chamada Firecrawl: usar `formats: ["extract"]` com campo `extract: { schema, prompt }` separado
- Melhorar o parser de markdown para capturar mais padroes de preço do ML (incluir precos sem link, capturar precos em formatos alternativos como `12345` centavos)

### 2. `supabase/functions/search-amazon/index.ts`
- Mesma correção do formato Firecrawl (mesmo bug)

### 3. Ambas as funções
- Adicionar log do body da resposta de erro do Firecrawl para facilitar debug futuro
- Aumentar `waitFor` para 5000ms para dar mais tempo ao JS do ML carregar

Nenhuma alteração de banco de dados ou frontend necessaria.

