

# Separar Lista de Compras por Frequência de Recorrência

## Conceito

Eliminar o modelo atual de "uma lista genérica com tudo misturado". A tela `/lista` passará a exibir **seções automáticas por frequência** (Quinzenal, Mensal, Bimestral, Trimestral), cada uma com sua data prevista de compra, calculada a partir do `last_purchased_at` do catálogo. O usuário poderá **alterar ou fixar a data** de cada seção.

## Modelo de dados

A tabela `shopping_lists` já possui o campo `planned_date`. Vamos usá-lo para armazenar a data fixa/editada pelo usuário.

**Nova abordagem**: ao invés de listas manuais, o sistema cria automaticamente uma lista por frequência (ex: "Mensal", "Quinzenal") vinculada ao usuário. Cada lista terá um novo campo `frequency_days` para identificar a frequência.

### Migration: adicionar `frequency_days` à tabela `shopping_lists`

```sql
ALTER TABLE public.shopping_lists ADD COLUMN frequency_days integer;
```

## Alterações em `src/pages/ShoppingList.tsx`

### 1. Auto-criar listas por frequência
Ao carregar a página, verificar quais frequências existem no `product_catalog` (ex: 15, 30, 60, 90). Para cada frequência que tenha produtos mas não tenha uma `shopping_list` correspondente, criar automaticamente (ex: nome "Mensal", `frequency_days: 30`).

### 2. Agrupar itens por frequência
Em vez de um Select de listas, renderizar **uma Card/seção por frequência** em ordem crescente (Quinzenal → Mensal → Bimestral → Trimestral). Cada seção mostra:
- Titulo com badge da frequência (ex: "Compras Mensais")
- Data prevista calculada (max `last_purchased_at` dos produtos + frequência) com botão de editar
- Subtotal estimado da seção
- Lista dos produtos daquela frequência com checkbox, preço, badge "Comprar hoje" / "Próx: dd/mm"
- Input para adicionar produto manualmente àquela frequência

### 3. Data editável
Cada seção terá a data prevista ao lado do título. Ao clicar, abre um input de data (ou date picker) que salva em `shopping_lists.planned_date`. Se `planned_date` estiver definido, usa essa data fixa; senão, calcula automaticamente.

### 4. Manter funcionalidade de itens avulsos
Produtos adicionados manualmente (sem recorrência no catálogo) ficarão em uma seção separada "Outros" no final.

### 5. Remover seletor de lista
O Select de listas e o botão "Nova Lista" serão substituídos pelo layout automático por frequência.

## Resultado esperado

```text
/lista
├── Compras Quinzenais   📅 25/03 [Editar data]   Total: R$ 32,50
│   ├── ☐ LEITE LV CAMPONESA TP 1L  ·  R$ 46,20  ·  Próx: 25/03
│   └── [+ Adicionar produto]
├── Compras Mensais      📅 09/04 [Editar data]   Total: R$ 48,00
│   ├── ☐ CAFÉ MELITTA 500G  ·  R$ 27,90  ·  Próx: 09/04
│   └── [+ Adicionar produto]
├── Compras Bimestrais   📅 09/05 [Editar data]   Total: R$ 1,69
│   ├── ☐ ESPONJA ASSOLAN  ·  R$ 1,69  ·  Próx: 09/05
│   └── [+ Adicionar produto]
└── Outros (avulsos)
    ├── ☐ Leite  ·  1 UN
    └── [+ Adicionar produto]
```

