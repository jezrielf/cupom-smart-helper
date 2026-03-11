

# Lista de Compras: Data Prevista e Projeção de Valor

## O que muda

Na página da Lista de Compras, mostrar para cada produto recorrente a **data prevista da próxima compra** (calculada como `last_purchased_at + purchase_frequency_days`) e exibir o **valor total estimado da compra** de forma mais proeminente no cabeçalho da lista.

## Alterações

### Arquivo: `src/pages/ShoppingList.tsx`

1. **Buscar dados extras do `product_catalog`**: Ao carregar a lista, fazer uma query paralela ao `product_catalog` para trazer `canonical_name`, `purchase_frequency_days`, `last_purchased_at` e `avg_price` dos produtos com recorrência definida.

2. **Mostrar data prevista por item**: Para cada item da lista que tem correspondência no catálogo recorrente, calcular `next_purchase_date = last_purchased_at + frequency_days` e exibir abaixo do nome do produto como texto secundário (ex: "Próx. compra: 25/03/26").

3. **Projeção de valor total**: No cabeçalho do card da lista, além do "Est:" atual, mostrar o total projetado mais destacado com um resumo tipo:
   - "Total estimado: R$ 245,80"
   - Contagem de itens pendentes vs concluídos

4. **Indicador visual de urgência**: Itens cuja data prevista já passou ou é hoje ficam com um badge "Comprar hoje" ou cor de destaque (ex: borda amarela/vermelha).

### Lógica de cálculo

```text
Para cada item na lista:
  1. Buscar no product_catalog pelo canonical_name
  2. Se tem purchase_frequency_days e last_purchased_at:
     next_date = last_purchased_at + frequency_days
  3. Se não tem last_purchased_at: next_date = hoje (nunca comprou)
  4. estimated_subtotal = estimated_price × quantity
```

### UI do item (mobile-friendly)

```text
[✓] LEITE INTEGRAL
    1 UN · R$ 6,49 · Próx: 25/03
    [Badge: Quinzenal] [🗑]
```

### Cabeçalho do card

```text
3/8 itens                    Total: R$ 245,80
                          2 itens urgentes
```

