

# CupomSmart MG — Fase 1: Design System, Layout e Navegação

Implementação da fundação do aplicativo: tema dark, layout com sidebar responsiva e todas as 8 rotas com páginas placeholder.

## O que será construído

1. **Tema dark** com as cores do design system (background #0f172a, surface #1e293b, bordas #334155, acentos azul/verde/vermelho/amarelo/roxo)
2. **Layout com sidebar fixa** usando shadcn Sidebar (240px expandida, colapsável para ícones)
3. **Navegação responsiva**: sidebar no desktop, bottom navigation no mobile
4. **8 rotas** com páginas placeholder: Dashboard (/), Scanner (/scanner), Cupons (/cupons), Supermercados (/supermercados), Comparativo (/comparativo), Produtos (/produtos), Lista de Compras (/lista), Análises (/analises)
5. **Ícones Lucide** para cada item de navegação
6. **Badge dinâmico** na Lista de Compras (placeholder por enquanto)

## Detalhes técnicos

### Arquivos a criar/modificar

- `src/index.css` — Atualizar variáveis CSS para tema dark com as cores definidas
- `src/components/layout/AppLayout.tsx` — Layout principal com SidebarProvider, header com trigger, e area de conteúdo
- `src/components/layout/AppSidebar.tsx` — Sidebar com os 8 itens de navegação, usando shadcn Sidebar + NavLink
- `src/components/layout/BottomNav.tsx` — Navegação inferior para mobile (visível apenas < 768px, esconde sidebar)
- `src/pages/Dashboard.tsx` — Placeholder
- `src/pages/Scanner.tsx` — Placeholder
- `src/pages/Receipts.tsx` — Placeholder (Meus Cupons)
- `src/pages/Supermarkets.tsx` — Placeholder
- `src/pages/PriceComparison.tsx` — Placeholder (Comparativo)
- `src/pages/ProductCatalog.tsx` — Placeholder (Produtos)
- `src/pages/ShoppingList.tsx` — Placeholder (Lista de Compras)
- `src/pages/Analytics.tsx` — Placeholder (Análises)
- `src/App.tsx` — Adicionar todas as rotas dentro do AppLayout

### Navegação

| Rota | Label | Ícone | Destaque |
|------|-------|-------|----------|
| / | Dashboard | LayoutDashboard | |
| /scanner | Ler Cupom | QrCode | Highlight (botão especial) |
| /cupons | Meus Cupons | FileText | |
| /supermercados | Supermercados | Store | |
| /comparativo | Comparativo | BarChart3 | |
| /produtos | Produtos | Package | |
| /lista | Lista de Compras | ShoppingCart | Badge |
| /analises | Análises | TrendingUp | |

### Cores CSS (dark theme)

```text
--background:    222 47% 11%    (#0f172a)
--foreground:    213 31% 95%    (#f1f5f9)
--card:          217 33% 17%    (#1e293b)
--border:        217 19% 27%    (#334155)
--muted-fg:      215 16% 47%   (#64748b)
--accent blue:   217 91% 60%   (#3b82f6)
--accent green:  142 71% 45%   (#22c55e)
--accent red:    0 84% 60%     (#ef4444)
```

Sem dependências novas -- tudo usa shadcn/ui Sidebar, Lucide React, e react-router-dom já instalados.

