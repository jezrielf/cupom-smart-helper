

# Diferenciar Unidades de Medida na Exibição de Produtos

## Problema

Atualmente, a exibição dos produtos mostra `{quantity} {unit} × R$ {unit_price}` de forma genérica, sem considerar que cada unidade tem semântica diferente. Por exemplo:
- KG: "0,11 KG × R$ 13,93" deveria indicar "por quilo"
- CX: "1 CX × R$ 46,20" deveria indicar "por caixa"

## Solução

Criar uma função utilitária `formatProductLine` que formata a linha de detalhe do produto de acordo com a unidade, com label descritivo e formatação adequada de quantidade (decimal para KG, inteiro para UN/CX etc.).

### Mapeamento de unidades:

| Sigla | Label | Exemplo formatado |
|-------|-------|-------------------|
| KG | /kg | 0,110 kg × R$ 13,93/kg |
| UN | un. | 1 un. × R$ 5,00 |
| GL | galão | 1 galão × R$ 15,00 |
| PC | peça | 2 peças × R$ 8,50 |
| SC | saco | 1 saco × R$ 25,00 |
| PT | pacote | 3 pacotes × R$ 4,20 |
| BR | barra | 2 barras × R$ 3,50 |
| TP | emb. | 1 emb. × R$ 46,20 |
| FR | frasco | 1 frasco × R$ 12,00 |
| CJ | conjunto | 1 conjunto × R$ 30,00 |
| BD | bandeja | 1 bandeja × R$ 18,00 |
| GF | garrafa | 2 garrafas × R$ 7,50 |
| CX | caixa | 1 caixa × R$ 46,20 |

### Regras de formatação:
- **KG**: quantidade com 3 casas decimais, preço mostra "/kg"
- **Demais**: quantidade inteira (sem decimais), label no singular/plural

## Arquivos a modificar

### 1. Novo: `src/lib/formatUnit.ts`
- Função `formatProductDetail(quantity, unit, unitPrice)` que retorna a string formatada
- Mapa de siglas para labels legíveis com singular/plural

### 2. `src/components/scanner/ReceiptPreview.tsx` (linhas 124-127)
- Substituir `{product.quantity} {product.unit} × R$ {product.unit_price.toFixed(2)}` pela função formatada

### 3. `src/pages/Receipts.tsx` (linha 191)
- Substituir `{p.quantity} {p.unit} × {formatBRL(Number(p.unit_price))}` pela função formatada

