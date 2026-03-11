

# Corrigir integração Recorrência → Lista de Compras

## Problema identificado

Quando você marca a recorrência de um produto, o `product_catalog` salva apenas `purchase_frequency_days`, mas **`last_purchased_at` e `avg_price` ficam `null`**. Isso causa dois problemas:
- Sem preço estimado na lista
- A lógica de sugestão funciona (produto aparece como "devido"), mas só é acionada ao criar lista nova ou clicar "Sugerir"

## Alterações

### 1. ProductCatalog: Preencher `last_purchased_at` e `avg_price` ao definir recorrência

**Arquivo: `src/pages/ProductCatalog.tsx`**

Na mutation `freqMut`, ao salvar a frequência, também buscar na tabela `products` o `purchase_date` mais recente e calcular o preço médio (`avg_price`) para aquele `product_name_normalized`. Salvar esses valores no `product_catalog`.

```text
1. Buscar da tabela products WHERE product_name_normalized = name AND user_id = user.id
2. Calcular avg_price = média de unit_price
3. last_purchased_at = max(purchase_date)
4. Salvar junto com purchase_frequency_days no upsert
```

### 2. ShoppingList: Mostrar seção de produtos recorrentes pendentes

**Arquivo: `src/pages/ShoppingList.tsx`**

Quando existe uma lista ativa, mostrar automaticamente uma seção "Produtos recorrentes" abaixo do cabeçalho (antes dos itens manuais), listando produtos do catálogo que estão "vencidos" e ainda não estão na lista. Cada item terá um botão "Adicionar" para incluí-lo na lista com um clique.

Também atualizar `FREQ_LABELS` para incluir `60: "Bimestral"` e `90: "Trimestral"`.

### 3. Resultado esperado

```text
Fluxo: Produtos → marca "Mensal" em CAFÉ MELITTA
       → avg_price e last_purchased_at são preenchidos
       → Lista de Compras mostra: "CAFÉ MELITTA · R$ 27,90 · Próx: 10/04"
       → Botão [+ Adicionar] para incluir na lista ativa
```

