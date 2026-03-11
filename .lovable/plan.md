

# Adicionar Menu Hambúrguer no Mobile

## O que será feito

Adicionar um botão hambúrguer (Menu icon) no **header mobile** (lado esquerdo), que ao clicar abre o sidebar completo como um Sheet/drawer lateral. Isso dará acesso a todas as rotas (Supermercados, Comparativo, Análises, Online, etc.) que não estão no BottomNav.

## Alterações

### `src/components/layout/AppLayout.tsx`

- Remover `className="hidden md:block"` do wrapper do `<AppSidebar />` -- o sidebar já tem lógica interna de mobile (renderiza como Sheet no mobile)
- No header, trocar o `<SidebarTrigger className="hidden md:flex" />` por `<SidebarTrigger />` (visível sempre)
- Mover o título "CupomSmart" para depois do trigger no mobile

O componente `Sidebar` do shadcn já renderiza como `<Sheet>` no mobile automaticamente, então basta:
1. Remover o `hidden md:block` do wrapper do AppSidebar
2. Mostrar o SidebarTrigger no mobile (remover `hidden md:flex`)
3. O ícone do SidebarTrigger já é um hambúrguer (PanelLeft) -- funciona perfeitamente

### Layout do header mobile:
```
[☰] CupomSmart                    [🌓]
```

Nenhum arquivo novo necessário. Apenas ajustes de classes CSS em `AppLayout.tsx`.

