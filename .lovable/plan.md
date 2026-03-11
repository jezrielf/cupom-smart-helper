

# CupomSmart MG — Fases 4 a 10: Todas as Páginas Funcionais

Implementação completa de todas as 6 páginas placeholder restantes, conectadas ao banco de dados.

## Fase 4: Dashboard (`/`)
- **5 KPI Cards**: Total Cupons, Gasto Total (R$), Ticket Médio, Supermercados Visitados, Produtos Únicos
- **Gráfico de linha** (Recharts): Gastos mensais dos últimos 6 meses
- **Gráfico de barras**: Top 5 supermercados por gasto
- **Lista**: Últimos 5 cupons com link para detalhes
- Dados via queries ao `receipts`, `products`, `supermarkets`

## Fase 5: Meus Cupons (`/cupons`)
- **Listagem** de cupons em cards com supermercado, data, total, quantidade de itens
- **Filtros**: período (date range picker), supermercado (select), ordenação (data/valor)
- **Dialog de detalhes**: ao clicar, abre modal com lista completa de produtos, preços, forma de pagamento
- **Botão deletar** cupom (com confirmação)
- **Empty state** quando não há cupons

## Fase 6: Supermercados (`/supermercados`)
- **Grid de cards** com nome, CNPJ, endereço, total de cupons, gasto total
- **Favoritar** supermercado (toggle `is_favorite`)
- **Dialog de detalhes**: últimos cupons, produtos mais comprados, gasto total
- **Busca** por nome

## Fase 7: Comparativo de Preços (`/comparativo`)
- **Campo de busca** por produto (usa RPC `get_price_comparison`)
- **Tabela comparativa**: produto x supermercado com preço médio, min, max, último preço
- **Badge de melhor preço** (highlight verde no menor)
- **Gráfico de linha**: evolução de preço do produto selecionado por supermercado (via `price_history`)

## Fase 8: Produtos (`/produtos`)
- **Listagem** do `product_catalog` com busca e filtro por categoria
- **Cards** com nome, preço médio, faixa de preço, vezes comprado, tendência (up/down/stable com ícone)
- **Paginação** ou scroll infinito

## Fase 9: Lista de Compras (`/lista`)
- **CRUD de listas**: criar, renomear, deletar listas
- **Adicionar itens**: nome do produto, quantidade, prioridade (alta/média/baixa)
- **Checkbox** para marcar item como comprado (`is_checked`)
- **Estimativa de total** baseada em `estimated_price`
- **Sugestão de preço**: ao adicionar item, busca último preço no `price_history`
- **Múltiplas listas** com tabs ou select

## Fase 10: Análises (`/analises`)
- **Gráfico de linha**: Gastos mensais (12 meses)
- **Gráfico de pizza**: Distribuição por supermercado
- **KPIs de tendência**: inflação pessoal (variação do ticket médio), produto que mais subiu/desceu
- **Tabela**: Top 10 produtos mais comprados com preço médio e tendência

## Detalhes técnicos

### Arquivos a criar/modificar
- `src/pages/Dashboard.tsx` — reescrita completa
- `src/pages/Receipts.tsx` — reescrita completa
- `src/pages/Supermarkets.tsx` — reescrita completa
- `src/pages/PriceComparison.tsx` — reescrita completa
- `src/pages/ProductCatalog.tsx` — reescrita completa
- `src/pages/ShoppingList.tsx` — reescrita completa
- `src/pages/Analytics.tsx` — reescrita completa

### Padrões
- Todas as queries via `supabase` client com `useAuth()` para `user.id`
- `useQuery` do TanStack para cache e loading states
- Recharts para todos os gráficos (já instalado)
- shadcn Dialog para modais de detalhes
- shadcn Select, Input, Calendar para filtros
- Formatação BR: `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`
- Empty states com ícone + mensagem + CTA para escanear cupom
- Skeleton loading em cards e tabelas

### Sem alterações no banco de dados
Todas as tabelas, RLS e funções já existem. Nenhuma migration necessária.

