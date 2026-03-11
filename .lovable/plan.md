

# Botão "Atualizar Todos" com Progresso Gradual

## O que será feito

Adicionar um botão "Atualizar todos" ao lado da barra de busca que percorre todos os produtos únicos (por `product_name_normalized`) sequencialmente, chamando `search-amazon` um por um com delay entre cada chamada. Uma barra de progresso mostra o avanço em tempo real.

## Alterações em `src/pages/ProductCatalog.tsx`

### Novo estado
- `bulkProgress: { current: number; total: number; currentProduct: string } | null` -- controla o progresso da atualização em massa

### Função `handleRefreshAll`
1. Extrair lista única de `product_name_normalized` dos produtos filtrados
2. Iterar sequencialmente (loop `for`), chamando `handleRefreshOnlinePrice` para cada um
3. Aguardar 1.5s entre cada chamada (`await new Promise(r => setTimeout(r, 1500))`) para não sobrecarregar o Firecrawl
4. Atualizar `bulkProgress` a cada iteração
5. Ao final, exibir toast de sucesso com contagem e limpar `bulkProgress`
6. Botão fica desabilitado durante a execução

### UI
- Botão com ícone `RefreshCw` ao lado do campo de busca: "Atualizar todos"
- Durante execução: barra de progresso (`Progress`) abaixo do botão com texto "Atualizando X de Y - Nome do produto..."
- Botão muda para "Atualizando..." com spinner enquanto roda

### Layout do header:
```
Produtos
[🔍 Buscar produto...        ] [🔄 Atualizar todos]
[████████░░░░░░░░] 3/12 - CAFÉ MELITTA 500G
```

Nenhuma alteração de banco necessária -- apenas UI.

