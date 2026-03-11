

# Corrigir Timeout da Edge Function

## Problema Real

Os logs confirmam: a API do Firecrawl **está configurada e funcionando**. O problema é timing:

- Firecrawl `extract` (AI) leva 45-60s e frequentemente retorna **408 (timeout)**
- Com 2 tentativas de 45s cada + delay = **~92s total**
- A edge function do Supabase tem limite de **~60s** e é encerrada antes de completar
- O fallback HTML **nunca é alcançado** porque a função morre antes

## Solução

### Arquivo: `supabase/functions/fetch-nfce/index.ts`

1. **Reduzir timeout do Firecrawl extract para 30s** (de 45s)
2. **Apenas 1 tentativa de extract** (sem retry no extract, que é muito lento)
3. **Se extract falhar, ir direto para Firecrawl `scrape` com `formats: ["extract"]` e timeout menor de 25s** como segunda tentativa
4. **Se tudo falhar, cair rapidamente no fallback HTML** (que leva ~5s)

Fluxo otimizado para caber em 60s:
```text
Extract (30s max) → falhou? → Retry extract (25s max) → falhou? → HTML fallback (5s)
Total máximo: ~60s
```

Mudança principal: reduzir `timeout` de `45000` para `30000` no primeiro attempt e `20000` no segundo, garantindo que sobre tempo para o fallback HTML caso ambos falhem.

### Sem alterações
- Frontend, banco de dados, componentes do scanner

