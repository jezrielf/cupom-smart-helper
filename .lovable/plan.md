

# Fix: Preços de atacado vs. unidade individual

## Problema

O produto "ESPONJA LA ACO ASSOLAN PC 45G" custa R$ 1,69 no supermercado (1 unidade). Mas os resultados online mostram:
- **Amazon**: R$ 59,90 — "Caixa Lã De Aço Bombril 14 Pacotes" (produto errado + atacado)
- **ML**: R$ 29,90 — "Fardo Pacote c/ 20 Unidades de 45g" (produto correto mas atacado de 20 unidades)

O filtro de volume passa porque detecta "45g" no título, mas ignora que são **20 unidades** de 45g. A comparação fica +3444% / +1669% mais cara — absurdo.

## Causa raiz

1. Amazon e ML vendem produtos de limpeza/higiene quase sempre em fardos/caixas com múltiplas unidades
2. O sistema não detecta a **quantidade de unidades** no título do resultado
3. O preço mostrado é o preço do fardo, não o preço unitário

## Solução

### 1. Extrair quantidade de unidades no scrape (ambas Edge Functions)

Adicionar `quantidade_unidades` ao schema de extração JSON. Instruir o prompt para identificar se o produto é vendido em packs/fardos e retornar quantas unidades contém.

```
schema: {
  titulo, preco_atual, disponivel,
  quantidade_unidades: number  // "Pack com 20 unidades" → 20
}
```

Prompt atualizado: *"Se o produto é vendido em pacote/fardo/caixa com múltiplas unidades, informe a quantidade total de unidades individuais no campo quantidade_unidades. Se for venda unitária, retorne 1."*

### 2. Calcular preço unitário

Após scrape, dividir `preco_atual / quantidade_unidades` para obter o preço por unidade individual, que é o que o supermercado vende.

### 3. Fallback: detectar quantidade no título via regex

Para casos onde o scrape não retorna `quantidade_unidades`, usar regex no título:
- `(\d+)\s*(unid|un\b|pct|pacote|und)` → extrai quantidade
- `c[/om]*\s*(\d+)` → "com 20", "c/ 8"
- `(\d+)\s*x\s*` → "20x45g"
- `fardo|caixa|kit|pack` → indica multi-pack

### 4. Mostrar informação de contexto no resultado

Quando o preço foi dividido, incluir no título uma indicação tipo "(preço por unidade)" para o usuário saber que é um cálculo.

### Arquivos modificados

- **`supabase/functions/search-amazon/index.ts`**: Atualizar schema de extração + regex de quantidade + cálculo de preço unitário
- **`supabase/functions/search-mercadolivre/index.ts`**: Mesmo tratamento

### O que NÃO muda
- Contrato de resposta `{ success, results: [{ title, price, url }] }` mantido
- Frontend sem alterações
- Normalização de nomes e volume matching mantidos

