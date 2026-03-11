

# Preço Online na Página de Produtos

## Objetivo

Exibir diretamente na listagem de Produtos o preço online (Amazon), a diferença percentual em relação ao preço do supermercado, e a data da última atualização. Incluir botão para atualizar o preço online sob demanda.

## Alterações

### 1. Migração: adicionar colunas em `product_catalog`

```sql
ALTER TABLE product_catalog
  ADD COLUMN online_price numeric,
  ADD COLUMN online_url text,
  ADD COLUMN online_updated_at timestamptz;
```

Essas colunas armazenam o cache do preço online para evitar chamadas repetidas ao Firecrawl.

### 2. `src/pages/ProductCatalog.tsx`

- Alterar a query de `product_catalog` para trazer `canonical_name, purchase_frequency_days, online_price, online_url, online_updated_at`
- Adicionar uma mutation que chama `search-amazon` e salva o resultado (`online_price`, `online_url`, `online_updated_at`) no `product_catalog`
- Para cada produto, agrupar por `product_name_normalized` e exibir:
  - Preço online (se disponível) com link para Amazon
  - Badge colorido: verde "X% mais barato" / vermelho "X% mais caro"
  - Data da última atualização (ex: "Atualizado 2h atrás")
  - Botão de refresh (icone) para buscar/atualizar preço online
- **Mobile cards**: nova linha com preço online, badge e botão refresh
- **Desktop table**: nova coluna "Online" com preço + badge + data

### 3. Fluxo do refresh

1. Usuário clica no ícone de refresh no produto
2. Chama edge function `search-amazon` com o `product_name_normalized`
3. Pega o menor preço dos resultados
4. Faz upsert no `product_catalog` com `online_price`, `online_url`, `online_updated_at = now()`
5. Invalida query para atualizar a UI

### Arquivos alterados

| Arquivo | Ação |
|---------|------|
| `product_catalog` (migração) | Adicionar 3 colunas |
| `src/pages/ProductCatalog.tsx` | Exibir preço online + botão refresh |

