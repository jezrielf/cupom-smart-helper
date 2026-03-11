

# Corrigir: Produtos recorrentes nunca aparecem na Lista de Compras

## Causa raiz

O problema esta na linha 250 do `ShoppingList.tsx`: o filtro `isUrgent(nextDate)` so mostra produtos cuja data prevista ja passou ou e hoje. Como a ultima compra foi em 10/03 e a frequencia e 30 dias, a proxima data e 09/04 -- no futuro. Resultado: `isUrgent` retorna `false` e o produto e filtrado.

O mesmo problema ocorre em `fetchRecurringProducts` (linha 120): `diffDays >= frequency` so retorna `true` quando o intervalo ja venceu.

**Em resumo**: o sistema so mostra produtos quando ja esta "atrasado". Mas o usuario quer ver TODOS os produtos recorrentes na lista, independente de estarem vencidos.

## Solucao

### 1. `pendingRecurring` -- mostrar TODOS os produtos recorrentes (nao so urgentes)

Remover o filtro `isUrgent` do `pendingRecurring`. Mostrar todos os produtos com recorrencia que nao estao na lista ativa. Manter o badge de urgencia para os que estao vencidos, mas exibir todos.

### 2. `fetchRecurringProducts` -- mesmo ajuste

Remover o filtro de `diffDays >= frequency` para que ao criar lista ou clicar "Sugerir", todos os produtos recorrentes sejam incluidos.

### 3. Visual: diferenciar urgentes dos futuros

- Produtos vencidos: badge vermelho "Comprar hoje"
- Produtos futuros: badge cinza com a data prevista (ex: "Prox: 09/04")

### Arquivo: `src/pages/ShoppingList.tsx`

Alteracoes em 3 trechos:

1. **`pendingRecurring`** (L246-251): remover `return isUrgent(nextDate)` → `return true`
2. **`fetchRecurringProducts`** (L116-121): remover filtro de dias → retornar todos com frequencia
3. **UI dos pendentes** (L370-383): adicionar badge de data/urgencia ao lado do nome

