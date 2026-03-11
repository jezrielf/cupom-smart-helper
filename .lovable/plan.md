

# Corrigir Extração: Retry no Firecrawl + Validação de Dados

## Problema Raiz

Os logs mostram que o Firecrawl **funciona corretamente quando não dá timeout** (52 produtos extraídos com sucesso em 12:06:30). Porém, frequentemente retorna **408 (Timeout)** porque a extração AI (`extract`) é lenta para páginas governamentais pesadas.

Quando o Firecrawl falha, o fallback cai no regex `parseNfceHtml()` que produz **dados lixo**: nome `"65"`, quantidade `208`, preço `9862` -- claramente incorreto.

## Solução

### 1. Retry no Firecrawl extract (até 2 tentativas)

Encapsular a chamada ao Firecrawl em um loop de retry com pequeno delay entre tentativas. O 408 é um timeout temporário do lado do Firecrawl, não um erro permanente.

```text
Tentativa 1 → 408? → aguarda 2s → Tentativa 2 → 408? → fallback
```

### 2. Validação dos dados antes de retornar

Se o fallback regex for usado, validar os dados extraídos:
- Se `products.length <= 1` e o HTML tem mais de 5000 caracteres, os dados provavelmente estão incorretos
- Se o nome do produto tem menos de 3 caracteres, é lixo
- Nesses casos, retornar erro claro em vez de dados corrompidos

### 3. Melhorar mensagem de erro ao usuário

Quando todas as tentativas falharem, retornar uma mensagem que sugira tentar novamente em vez de mostrar dados incorretos.

## Mudanças

### Arquivo: `supabase/functions/fetch-nfce/index.ts`

- Adicionar função `tryFirecrawlExtract(url, apiKey, maxRetries=2)` com loop de retry e delay de 2s entre tentativas
- Adicionar validação nos dados do regex: se `item_count <= 1` e o HTML é grande, considerar extração falha
- Retornar `{ error: "Não foi possível extrair os produtos. Tente novamente." }` com status 502 quando os dados são claramente inválidos, em vez de retornar lixo
- Manter o fluxo: Firecrawl extract (com retry) → Firecrawl HTML + regex → native fetch + regex → erro

### Sem alterações
- Frontend, banco de dados, componentes do scanner permanecem iguais

