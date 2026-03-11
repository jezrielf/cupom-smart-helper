

# Desativar iFood temporariamente

## Problema

A URL `https://www.ifood.com.br/busca?q=...` retorna **lojas** que vendem o produto, não produtos individuais com preços. Para ver preços no iFood, o usuário precisa entrar em uma loja específica primeiro. Isso torna a extração de preços via scraping inviável com a abordagem atual.

## Solução

Desativar o iFood como fonte de comparação, mantendo todo o código e as colunas do banco para reativação futura.

### Mudanças:

1. **`src/pages/ProductCatalog.tsx`**: Remover o botão de refresh iFood e a linha de preço iFood do `OnlinePriceBadge`. Remover iFood do "Atualizar Todos".

2. **`src/pages/OnlineComparison.tsx`**: Remover a aba iFood do `ComparisonTabs` e a busca iFood do `searchAll`.

### O que **não** muda:
- As colunas `ifood_price`, `ifood_url`, `ifood_updated_at` continuam no banco (sem migração)
- O edge function `search-ifood` continua existindo (pode ser útil no futuro com outra abordagem)
- Nenhuma exclusão de código backend

