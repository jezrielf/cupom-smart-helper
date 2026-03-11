

# Fix: Resultados imprecisos -- manter volume/peso na busca e validar produtos

## Problema raiz

A função `normalizeForSearch` **remove** toda informação de peso/volume do nome do produto antes de montar a URL de busca. Exemplo:

- `"ANTISSEP BUCAL BIANCO 500ML"` vira `"antisseptico bucal bianco"` (sem "500ml")
- A busca retorna produtos de qualquer tamanho, e o sistema pega o mais barato (que pode ser de 250ml)
- O preço exibido é de um produto diferente do que o usuário comprou

Além disso, o prompt de extração do Firecrawl é genérico demais -- não pede para filtrar por tamanho.

## Solução

### 1. Separar normalização em duas partes: texto limpo + volume

Em vez de remover o volume, **extrair** ele e **incluir** na busca:

```
"ANTISSEP BUCAL BIANCO 500ML ULTRA SUPERMINT"
  → texto: "antisseptico bucal bianco ultra supermint"
  → volume: "500ml"
  → busca: "antisseptico bucal bianco 500ml"
```

A função `normalizeForSearch` passa a retornar `{ searchTerms, volume }`. O volume é mantido na URL de busca para que Amazon/ML/iFood filtrem pelo tamanho correto.

### 2. Prompt de extração específico com volume

O prompt do Firecrawl `extract` passará a incluir o volume esperado:

```
"Extract the first 5 product results that match '500ml' size. 
Include title, price in BRL, product URL, and size/volume. 
Only include products that match or are closest to the specified size."
```

### 3. Schema com campo `volume` para validação

Adicionar `volume` ao schema de extração para poder comparar:

```json
{
  "title": "string",
  "price": "number",
  "url": "string",
  "volume": "string - e.g. 500ml, 1kg, 1L"
}
```

### 4. Filtragem pós-extração

Após receber os resultados, filtrar produtos cujo volume extraído seja compatível com o volume original. Se nenhum resultado compatível for encontrado, retornar os resultados sem filtro mas com aviso.

### 5. Expandir mapa de abreviações

Adicionar termos faltantes nos 3 edge functions:
- `antissep` → `antisseptico`
- `bucal` (já é completo, manter)
- `hig` → `higienico`
- `papel` (completo)
- `sab` → `sabao` (além de `sabonete`, contexto-dependente)
- `alc` → `alcool`
- `desinf` → `desinfetante`

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/search-amazon/index.ts` | Manter volume na busca, prompt com volume, schema com volume, filtro pós-extração |
| `supabase/functions/search-mercadolivre/index.ts` | Idem |
| `supabase/functions/search-ifood/index.ts` | Idem |

## Sem mudanças no banco de dados

