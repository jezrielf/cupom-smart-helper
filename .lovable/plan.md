

# Corrigir Extração de Dados da NFC-e

## Diagnóstico

O Firecrawl **está funcionando** — os logs confirmam que retorna ~22.000 caracteres de HTML. O problema está no **parsing regex** (`parseNfceHtml`): os padrões não correspondem à estrutura real do HTML da SEFAZ MG, resultando em dados corrompidos (nome `5%;">`  , produto `65`, quantidade `208`).

Corrigir regex para um site governamental que pode mudar a estrutura a qualquer momento é frágil. A solução robusta é usar a **extração JSON do Firecrawl** — ele usa IA para extrair dados estruturados diretamente do HTML.

## O que muda

### 1. Edge Function (`supabase/functions/fetch-nfce/index.ts`)

**Trocar `formats: ["html"]` por `formats: ["json"]` com schema definido:**

O Firecrawl aceita um schema JSON que descreve os campos desejados. Ele usa IA para interpretar a página e retornar os dados estruturados — sem regex.

```ts
formats: [{ 
  type: "json", 
  schema: {
    type: "object",
    properties: {
      emitter_name: { type: "string" },
      emitter_cnpj: { type: "string" },
      emitter_address: { type: "string" },
      purchase_date: { type: "string" },
      access_key: { type: "string" },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            name: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            unit_price: { type: "number" },
            total_price: { type: "number" }
          }
        }
      },
      total_amount: { type: "number" },
      total_discount: { type: "number" },
      payment_method: { type: "string" }
    }
  },
  prompt: "Extraia os dados desta nota fiscal eletrônica (NFC-e) brasileira. Inclua todos os produtos listados com nome, quantidade, unidade, preço unitário e preço total. O CNPJ deve conter apenas dígitos."
}]
```

**Fluxo atualizado:**
1. Firecrawl recebe a URL → renderiza o JS → extrai dados via IA → retorna JSON estruturado
2. Se a resposta JSON tiver produtos, usar diretamente (sem regex)
3. Se falhar, cair no fallback: buscar HTML (Firecrawl `html` ou `fetch` nativo) + `parseNfceHtml()` como backup

### 2. Manter `parseNfceHtml()` como fallback

A função regex existente continua no código como segunda tentativa, caso a extração JSON falhe ou o Firecrawl esteja indisponível.

### Arquivos modificados
- `supabase/functions/fetch-nfce/index.ts` — usar extração JSON do Firecrawl como método principal, regex como fallback

### Sem alterações
- Nenhuma mudança no frontend, banco de dados, ou componentes do scanner

