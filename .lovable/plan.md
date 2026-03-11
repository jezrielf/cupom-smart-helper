

# Três Melhorias: Supermercados, Produtos e Lista de Compras

## 1. Supermercados: Editar Nome Fantasia

No dialog de detalhes do supermercado, adicionar um campo editável para o `trade_name` com botão de salvar. Mutation faz `update` na tabela `supermarkets`.

### Arquivo: `src/pages/Supermarkets.tsx`
- Adicionar estado `editingName` e `editedName`
- No dialog, mostrar Input editável para trade_name com botão de salvar
- Mutation para `supabase.from("supermarkets").update({ trade_name }).eq("id", id)`

## 2. Produtos: Listar Produtos dos Cupons

Reescrever `ProductCatalog.tsx` para mostrar os produtos reais da tabela `products` (compras do usuário), com: data de compra, nome, código, quantidade, unidade, preço unitário, preço total, supermercado. Adicionar busca e opção de marcar recorrência.

### Arquivo: `src/pages/ProductCatalog.tsx`
- Query na tabela `products` (com `user_id = auth.uid()`) em vez de `product_catalog`
- Mostrar tabela/lista com colunas: data, produto, código, qtd, unidade, preço unit., total
- Adicionar busca por nome
- Para cada produto, botão/toggle para marcar recorrência de compra (salva no `product_catalog`)

### Migração: Adicionar coluna `purchase_frequency_days` ao `product_catalog`
- `ALTER TABLE product_catalog ADD COLUMN purchase_frequency_days integer DEFAULT NULL`
- NULL = sem recorrência, 7 = semanal, 15 = quinzenal, 30 = mensal

## 3. Lista de Compras: Auto-popular com Produtos Recorrentes

Quando o usuário cria uma nova lista ou clica "Sugerir produtos", buscar produtos do `product_catalog` onde `purchase_frequency_days IS NOT NULL` e `last_purchased_at + frequency_days <= hoje`. Inserir automaticamente como itens da lista.

### Arquivo: `src/pages/ShoppingList.tsx`
- Ao criar lista, buscar produtos recorrentes que estão "na hora" de comprar
- Botão "Adicionar sugeridos" que popula a lista com esses produtos
- Cada item sugerido vem com `estimated_price` = último preço médio do catálogo

## Fluxo do Usuário

```text
1. Escaneia cupons → produtos salvos na tabela "products"
2. Vai em Produtos → vê histórico de compras, marca "compro a cada 15 dias"
3. Vai em Lista de Compras → cria lista → produtos recorrentes já aparecem
```

## Resumo de Mudanças

| Arquivo | Ação |
|---------|------|
| Migração SQL | Adicionar `purchase_frequency_days` ao `product_catalog` |
| `src/pages/Supermarkets.tsx` | Campo editável para trade_name no dialog |
| `src/pages/ProductCatalog.tsx` | Reescrever para listar produtos do usuário com detalhes + toggle de recorrência |
| `src/pages/ShoppingList.tsx` | Auto-sugerir produtos recorrentes ao criar lista |

