

# Inteligência Artificial para o CupomSmart

## Objetivo

Criar uma camada de IA que torne o sistema mais inteligente em 4 áreas:

1. **Normalização inteligente de produtos** - Ao salvar um cupom, usar IA para identificar o produto real (marca, tipo, peso) a partir da descrição abreviada do cupom fiscal
2. **Vinculação cross-supermercado** - Identificar que "MAC ADRIA ESPAG 500G" do Supermercado A é o mesmo produto que "MACARRAO ADRIA ESPAGUETE 500G" do Supermercado B
3. **Análise de histórico** - Identificar padrões de consumo, tendências de preço e alertas
4. **Sugestões inteligentes** - Recomendar substituições mais baratas, melhor momento de compra, e produtos esquecidos

## Arquitetura

Uma nova Edge Function `ai-product-intelligence` que usa Lovable AI (Gemini Flash) para processar produtos via tool calling (structured output).

### Edge Function: `ai-product-intelligence`

Recebe uma lista de produtos do cupom e o catálogo existente. Retorna:
- Nome normalizado canônico para cada produto
- Match com produtos existentes no catálogo (vinculação)
- Sugestões baseadas no histórico

```text
Frontend (Scanner.tsx)
  │
  ├─ Salva cupom (como hoje)
  │
  └─ Chama ai-product-intelligence
       │
       ├─ Input: produtos do cupom + catálogo existente
       │
       └─ Output: { 
            normalized_products: [{ original, canonical_name, brand, weight, category }],
            catalog_matches: [{ product_name, matched_catalog_id, confidence }],
            suggestions: [{ type, message, product_name }]
          }
```

### Mudanças por componente

**1. Nova Edge Function `supabase/functions/ai-product-intelligence/index.ts`**
- Usa Lovable AI Gateway (`google/gemini-3-flash-preview`) via tool calling
- Endpoint recebe `{ products: [...], catalog: [...], price_history_summary: [...] }`
- Usa tool calling para retorno estruturado com 3 ferramentas:
  - `normalize_products` - normaliza nomes e extrai marca/peso/categoria
  - `match_catalog` - vincula produtos com catálogo existente
  - `generate_insights` - gera sugestões e alertas

**2. Atualizar `src/pages/Scanner.tsx`**
- Após salvar o cupom com sucesso, chamar a edge function de IA
- Atualizar o `product_catalog` com os nomes canônicos e categorias identificados pela IA
- Mostrar toast com sugestões recebidas (ex: "Encontramos uma alternativa 30% mais barata para Macarrão Adria")

**3. Atualizar `src/pages/ProductCatalog.tsx`**
- Adicionar botão "Analisar com IA" que processa todos os produtos
- Exibir categoria e marca identificados pela IA
- Mostrar badge quando produtos de diferentes supermercados são vinculados

**4. Novo componente `src/components/ai/AISuggestions.tsx`**
- Card de sugestões na Dashboard ou Lista de Compras
- Mostra insights como: "Você compra Arroz Camil 5kg a cada 30 dias. O preço subiu 12% no último mês. Considere comprar no Supermercado X onde está R$ 24,90."
- Tipos de sugestão: `price_alert`, `cheaper_alternative`, `forgotten_product`, `best_time_to_buy`

**5. `supabase/config.toml`**
- Adicionar `[functions.ai-product-intelligence]` com `verify_jwt = false`

### Modelo de dados

Adicionar colunas ao `product_catalog` via migration:
- `brand` (text, nullable) - Marca identificada pela IA
- `weight_g` (numeric, nullable) - Peso normalizado em gramas
- `ai_category` (text, nullable) - Categoria atribuída pela IA

### Fluxo de normalização com IA

Exemplo: o cupom traz `"MAC ADRIA ESPAG TRAD 500G UN"`. A IA:
1. Normaliza para `"MACARRAO ADRIA ESPAGUETE TRADICIONAL 500G"`
2. Extrai: marca=Adria, peso=500g, categoria=Massas
3. Busca no catálogo e encontra match com `"MACARRAO ADRIA ESPAGUETE 500G"` (confidence: 0.95)
4. Vincula ao mesmo `product_catalog.id`

### Custo

- Usa Lovable AI (Gemini Flash) - incluso no plano
- ~1 chamada por cupom escaneado (15-30 produtos por vez)
- Chamadas sob demanda para análise de catálogo

### O que NÃO muda
- Edge Functions de busca Amazon/ML permanecem como estão
- Fluxo de leitura de NFC-e permanece como está
- Estrutura de tabelas existente preservada (apenas novas colunas)

