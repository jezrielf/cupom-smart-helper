

# Corrigir integração Recorrência → Lista de Compras

## Problemas identificados

1. **Query keys diferentes**: No `ProductCatalog.tsx`, ao salvar a recorrência, o `onSuccess` invalida a query key `["product-catalog-freq"]`. Porém, a `ShoppingList.tsx` usa a query key `["product-catalog-recurrence"]`. Resultado: a lista de compras nunca recebe os dados atualizados do catálogo sem refresh manual.

2. **Produtos recorrentes invisíveis sem lista**: A seção "Produtos recorrentes pendentes" só aparece quando `activeListId` existe. Se o usuário não tem nenhuma lista criada, os produtos recorrentes nunca são exibidos.

3. **`avg_price` e `last_purchased_at` ficam `null`**: Nos dados da rede, "ESPONJA LA ACO ASSOLAN PC 45G" aparece com `avg_price: null` e `last_purchased_at: null`, indicando que a query de products pode não ter retornado dados (possivelmente o `product_name_normalized` não bate exatamente).

## Alterações

### Arquivo: `src/pages/ProductCatalog.tsx`
- No `onSuccess` do `freqMut`, adicionar invalidação da query key `["product-catalog-recurrence"]` para sincronizar com a ShoppingList.

### Arquivo: `src/pages/ShoppingList.tsx`
- Remover a dependência de `activeListId` para calcular `pendingRecurring`. Mostrar os produtos recorrentes pendentes mesmo sem lista ativa.
- Quando não há listas mas há produtos recorrentes pendentes, mostrar uma seção especial: "X produtos com recorrência estão pendentes" com botão "Criar Lista" que já inclui esses itens.
- Garantir que a query do catálogo rode sempre (não dependa de `activeListId`).

### Resultado esperado

```text
Fluxo: Produtos → marca "Bimestral" em ESPONJA
       → invalida ["product-catalog-freq"] E ["product-catalog-recurrence"]
       → Lista de Compras carrega catálogo atualizado
       → Mesmo sem lista criada: mostra "1 produto recorrente pendente"
       → Botão "Criar Lista" → lista criada com ESPONJA já inclusa
```

