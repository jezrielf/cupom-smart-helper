

# Ajustar Recorrência e Menu Mobile

## 1. Recorrência: Quinzenal, Mensal, Bimestral, Trimestral

### Arquivo: `src/pages/ProductCatalog.tsx` (linhas 17-22)
Substituir as opções de frequência:
```
{ value: "none", label: "Sem recorrência" }
{ value: "15", label: "Quinzenal" }
{ value: "30", label: "Mensal" }
{ value: "60", label: "Bimestral" }
{ value: "90", label: "Trimestral" }
```
Remover a opção "Semanal" (7 dias).

## 2. Menu Mobile: Home, Cupons, Produtos, Lista

### Arquivo: `src/components/layout/BottomNav.tsx` (linhas 11-17)
Substituir os itens do menu por:
```
Home (/) → LayoutDashboard
Cupons (/cupons) → FileText
Produtos (/produtos) → Package
Lista (/lista) → ShoppingCart
```
Remover Scanner (highlight) e Análises. Nenhum item com `highlight: true`.

