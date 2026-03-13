

# Otimização da busca Amazon/ML — Precisão real dos resultados

## Problema real (visível nos dados)

Os preços online estão **errados** porque o Firecrawl busca via Google e retorna produtos diferentes:
- "LEITE PO PIRACANJUBA 1KG" → retorna "Creme de Leite Piracanjuba 200g" (R$4.99 vs R$37.90 local)
- "CAFE MELITTA 500G TRAD" → retorna "Café Solúvel Extraforte Melitta" (produto diferente)
- "AGUA SANITARIA SANTA CLARA 5L" → retorna "Água Sanitária Sanol" (marca diferente)
- "DESOD AERO MONANGE" → retorna "Desodorante Above" (marca diferente)

A raiz do problema: **busca via Google + scrape individual** perde contexto. O Google não entende que "LEITE PO" é "leite em pó" e retorna qualquer coisa da Piracanjuba.

## Solução: Scrape direto na página de busca da Amazon/ML

Em vez de Google → filtrar URLs → scrape individual (4 chamadas), fazer **1 único scrape** direto na URL de busca do marketplace com extração JSON estruturada de múltiplos produtos.

### Vantagens
- **1 chamada Firecrawl** em vez de 4 (economia de 75% em créditos)
- **Resultados nativos do marketplace** — a Amazon/ML já faz matching de produto, muito melhor que Google
- **Múltiplos resultados** em 1 chamada — extrair top 5 produtos com preço, título, URL
- **Validação de marca** — comparar brand do resultado com brand do produto original
- **Cache inteligente** — não re-buscar se `online_updated_at` < 6h

### Mudanças

**1. `supabase/functions/search-amazon/index.ts` — Reescrever**

Estratégia nova:
```text
ANTES: Firecrawl Search (Google) → filtrar URLs Amazon → scrape 1-3 páginas individuais
DEPOIS: Firecrawl Scrape (amazon.com.br/s?k=...) → extract JSON com schema de múltiplos produtos
```

- Construir URL direta: `https://www.amazon.com.br/s?k=${query}`
- Usar Firecrawl `scrape` com `formats: ['extract']` e schema que extrai array de produtos
- Schema rico: `title`, `price`, `url`, `is_prime`, `rating`, `reviews_count`, `discount_percent`, `image_url`
- Manter a normalização de nome existente (abbreviation map, volume detection)
- Adicionar **validação de relevância**: comparar palavras-chave do título original com o resultado, descartar se < 40% de match
- Manter detecção de pack/kit para calcular preço unitário

**2. `supabase/functions/search-mercadolivre/index.ts` — Mesma otimização**

- URL direta: `https://lista.mercadolivre.com.br/${query}_OrderId_PRICE`
- Mesmo schema de extração com array de produtos
- Mesma validação de relevância

**3. `src/pages/ProductCatalog.tsx` — Cache inteligente**

- Antes de chamar a edge function, verificar `online_updated_at` no `product_catalog`
- Se a diferença for < 6h, usar o preço em cache
- Mostrar "Atualizado há X horas" ao lado do preço
- Reduz chamadas desnecessárias ao Firecrawl

**4. `src/pages/OnlineComparison.tsx` — Dados enriquecidos**

- Atualizar interface `OnlineResult` para incluir `is_prime`, `rating`, `discount_percent`, `image_url`
- Exibir badge Prime, estrelas de rating, e % de desconto nos resultados
- Manter a estrutura de tabs Amazon/ML existente

### Schema de extração (exemplo Amazon)

```json
{
  "type": "object",
  "properties": {
    "produtos": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "titulo": { "type": "string" },
          "preco": { "type": "number" },
          "url_relativa": { "type": "string" },
          "prime": { "type": "boolean" },
          "avaliacao": { "type": "number" },
          "num_avaliacoes": { "type": "number" },
          "desconto_percent": { "type": "number" },
          "imagem_url": { "type": "string" }
        }
      }
    }
  }
}
```

O prompt instrui o Firecrawl a extrair os primeiros 5-8 resultados de produto da página de busca, ignorando anúncios patrocinados, e retornando o preço à vista (não parcela/frete).

### Validação de relevância

Nova função `calculateRelevance(originalName, resultTitle)` que:
1. Extrai palavras significativas do nome original (ignorando códigos de embalagem)
2. Compara com palavras do título do resultado
3. Dá peso extra para match de marca (ex: "Piracanjuba", "Melitta", "Camponesa")
4. Descarta resultados com relevância < 40%

Isso evitaria os erros atuais como "Sanol" quando buscamos "Santa Clara".

### Nenhuma mudança de banco de dados
As colunas existentes no `product_catalog` já suportam todos os dados necessários.

