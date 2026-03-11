

# Comparativo Online -- Amazon Brasil via Firecrawl

## Conceito

Nova pagina `/comparativo-online` que lista os produtos do usuario (do `product_catalog` ou `products`) e, ao clicar "Comparar", busca o preco na Amazon Brasil via Firecrawl. Exibe preco supermercado vs online com percentual de diferenca.

## URL da Amazon

Padrao simplificado:
```
https://www.amazon.com.br/s?k={produto}+{produto}&s=price-asc-rank
```
Onde espacos viram `+`. Ex: "LEITE CONDENSADO" → `leite+condensado`

## Componentes

### 1. Edge Function: `supabase/functions/search-amazon/index.ts`

- Recebe `product_name` no body
- Normaliza: lowercase, remove acentos, substitui espacos por `+`
- Monta URL: `https://www.amazon.com.br/s?k=${nome}&s=price-asc-rank`
- Usa Firecrawl scrape com formato JSON + schema para extrair array de `{ title, price, url }` dos primeiros resultados
- Fallback: scrape markdown + regex para extrair precos `R$ XX,XX`
- Retorna `{ results: [{ title, price, url }] }`
- CORS headers padrao, `verify_jwt = false`

### 2. Nova pagina: `src/pages/OnlineComparison.tsx`

- Campo de busca que filtra produtos do catalogo local
- Ao clicar em um produto, dispara a edge function
- Card de comparacao:
  - Preco supermercado (ultimo/medio do `price_history` ou `products`)
  - Preco Amazon (mais barato encontrado)
  - Badge: "X% mais barato" (verde) ou "X% mais caro" (vermelho)
  - Link "Ver na Amazon"
- Loading skeleton durante busca
- Possibilidade de buscar termo livre (nao so produtos existentes)

### 3. Rota e navegacao

- `App.tsx`: rota `/comparativo-online` com `<OnlineComparison />`
- `AppSidebar.tsx`: novo item "Online" com icone `Globe` do lucide

### 4. Config

- `supabase/config.toml` ja e auto-gerenciado (funcao sera registrada automaticamente)
- `FIRECRAWL_API_KEY` ja esta configurada como secret

## Resultado esperado

```text
/comparativo-online
┌─ Buscar produto: [café melitta________] [Buscar]
│
├─ CAFÉ MELITTA 500G
│  Supermercado: R$ 27,90  │  Amazon: R$ 24,50  │  🟢 12% mais barato
│  [Ver na Amazon ↗]
│
├─ LEITE CONDENSADO MOÇA 395G
│  Supermercado: R$ 8,49   │  Amazon: R$ 9,90   │  🔴 17% mais caro
│  [Ver na Amazon ↗]
```

## Arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/search-amazon/index.ts` | Criar |
| `src/pages/OnlineComparison.tsx` | Criar |
| `src/App.tsx` | Adicionar rota |
| `src/components/layout/AppSidebar.tsx` | Adicionar item nav |

