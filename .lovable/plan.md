

# Restaurar Bolinha do Scanner + Responsividade em Produtos

## 1. BottomNav: Restaurar botão Scanner no centro

Voltar o layout com 5 itens: Home, Cupons, **Scanner (bolinha central)**, Produtos, Lista. O Scanner fica como um botão circular elevado no centro da barra.

### Arquivo: `src/components/layout/BottomNav.tsx`
- 4 itens normais (Home, Cupons, Produtos, Lista) posicionados ao redor
- Botão central circular com ícone de câmera/scanner, elevado acima da barra, linking para `/scanner`
- Estilo: `bg-primary text-primary-foreground rounded-full h-14 w-14 -mt-6 shadow-lg`

## 2. Produtos: Layout responsivo mobile

No mobile (< sm), trocar a tabela por cards empilhados. Cada card mostra: nome do produto, data, qtd/unidade, preço total, e select de recorrência.

### Arquivo: `src/pages/ProductCatalog.tsx`
- Manter a tabela existente com `hidden md:block`
- Adicionar lista de cards com `md:hidden` que mostra:
  - Nome do produto (bold) + data
  - Detalhes: qtd/unidade formatada + preço total
  - Supermercado
  - Select de recorrência
- Busca permanece igual (já está responsiva)

