

# Integrar Firecrawl na Edge Function fetch-nfce

## Problema atual
A edge function usa `fetch()` nativo para acessar o portal da SEFAZ MG. Sites governamentais frequentemente bloqueiam requests simples, retornam páginas com JavaScript dinâmico, ou exigem renderização completa do browser. O Firecrawl resolve isso com renderização headless e bypass de proteções anti-bot.

## O que muda

### 1. Conectar o Firecrawl
- Usar o conector Firecrawl via `standard_connectors--connect` para disponibilizar a `FIRECRAWL_API_KEY` nas edge functions.

### 2. Modificar `supabase/functions/fetch-nfce/index.ts`
- Substituir o `fetch()` nativo pela API do Firecrawl (`https://api.firecrawl.dev/v1/scrape`)
- Solicitar formato `html` (para manter o parsing regex existente) e opcionalmente `markdown` (para fallback)
- Manter toda a lógica de parsing `parseNfceHtml()` intacta — ela continua recebendo HTML
- Adicionar fallback: se Firecrawl falhar, tentar com `fetch()` nativo

### 3. Fluxo atualizado
```text
QR Code → URL da NFC-e
  → Edge Function
    → Firecrawl scrape(url, formats: ['html'])
      → Renderiza página completa (JS, anti-bot)
      → Retorna HTML limpo
    → parseNfceHtml(html) [sem alteração]
    → Retorna dados estruturados
```

### 4. Mudanças no código
No trecho que faz `fetch(url, {...})` (linhas ~260-280), substituir por:
```ts
const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url,
    formats: ['html'],
    waitFor: 3000, // esperar JS renderizar
  }),
});
const firecrawlData = await firecrawlResponse.json();
const html = firecrawlData.data?.html || firecrawlData.html;
```

Se `FIRECRAWL_API_KEY` não estiver configurada, faz fallback para `fetch()` nativo (comportamento atual).

### Arquivos modificados
- `supabase/functions/fetch-nfce/index.ts` — usar Firecrawl para scraping, manter parsing

### Sem alterações
- Nenhuma mudança no frontend, banco de dados, ou componentes do scanner
- A função `parseNfceHtml()` permanece idêntica

