

# Comparativo de Preços — Tela completa com produtos comprados + online

## Problema atual

A página `/comparativo` exige que o usuário digite um termo de busca (mín. 2 letras) para ver resultados. Não mostra nenhum produto automaticamente e não inclui preços online (Amazon/ML) na comparação.

## Solução

Transformar a página em uma visão completa de todos os produtos já comprados, com comparação entre supermercados E canais online, carregando dados automaticamente.

### Mudanças

**1. `src/pages/PriceComparison.tsx` — Reescrever a página**

- **Carregar todos os produtos automaticamente**: Chamar `get_price_comparison` sem `search_term` (já suportado pelo RPC — retorna tudo quando `search_term IS NULL`)
- **Adicionar filtro de busca como filtro local** (client-side) em vez de trigger de query
- **Integrar preços online do `product_catalog`**: Fazer query ao `product_catalog` para trazer `online_price`, `ml_price`, `online_url`, `ml_url` e exibir como colunas adicionais na tabela
- **Adicionar coluna "Online" na tabela** com preços Amazon e ML ao lado dos supermercados, com badge "Mais barato" quando online for menor
- **Filtros**: Adicionar filtro por categoria (usando `ai_category` do catálogo) e opção de ordenar por nome, preço, ou economia potencial
- **Cards mobile-friendly**: No mobile, mostrar cards com resumo do produto (melhor preço supermercado vs melhor preço online)

**Layout da tabela por produto:**

```text
┌─────────────────────────────────────────────────────┐
│ MACARRÃO ADRIA ESPAGUETE 500G          [Massas]     │
├──────────────────┬────────┬───────┬─────┬───────────┤
│ Canal            │ Último │ Médio │ Mín │ Compras   │
├──────────────────┼────────┼───────┼─────┼───────────┤
│ 🏪 Supermerc. A │ R$4,50 │ R$4,30│R$3,90│ 5        │
│ 🏪 Supermerc. B │ R$4,90 │ R$4,80│R$4,50│ 2        │
│ 🛒 Amazon       │ R$5,20 │   -   │  -  │    -      │
│ 🛒 Mercado Livre│ R$4,10 │   -   │  -  │    -  ⭐  │
└──────────────────┴────────┴───────┴─────┴───────────┘
```

**2. Nenhuma mudança de backend necessária**

- O RPC `get_price_comparison` já suporta `search_term = NULL` para retornar tudo
- Os preços online já estão no `product_catalog`
- Apenas precisa de um JOIN client-side entre os dados do RPC e do `product_catalog`

### Detalhes técnicos

- Query 1: `supabase.rpc("get_price_comparison", {})` — todos os produtos com preços por supermercado
- Query 2: `supabase.from("product_catalog").select("canonical_name, online_price, ml_price, online_url, ml_url, ai_category, brand")` — preços online
- Merge client-side por `product_name_normalized` ↔ `canonical_name`
- Manter o gráfico de evolução de preço ao clicar no produto
- Filtro local por texto + dropdown de categoria
- Ordenação: nome (A-Z), menor preço, maior economia online

