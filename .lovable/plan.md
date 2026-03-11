

# Tema Claro (Light Mode) com Toggle no Header

## O que será feito

1. **CSS (`src/index.css`)**: Mover as variáveis atuais para `.dark` e adicionar variáveis de tema claro no `:root`. O tema claro terá fundo branco, cards cinza claro, textos escuros, mantendo o mesmo azul primário.

2. **ThemeProvider (`src/components/ThemeProvider.tsx`)**: Criar um provider usando `next-themes` (já instalado) que persiste a preferência no localStorage e aplica a classe `dark`/`light` no `<html>`.

3. **ThemeToggle (`src/components/ThemeToggle.tsx`)**: Botão com ícone Sun/Moon (Lucide) que alterna entre temas. Compacto, vai no header.

4. **AppLayout header**: Adicionar o `ThemeToggle` no canto direito do header (ao lado do SidebarTrigger).

5. **App.tsx**: Envolver tudo com `<ThemeProvider defaultTheme="dark">`.

6. **Login page**: Adicionar toggle também na tela de login.

## Variáveis do tema claro (`:root`)
- background: branco `0 0% 100%`
- foreground: cinza escuro `222 47% 11%`
- card: cinza claro `210 40% 96%`
- muted: cinza `210 40% 90%`
- sidebar: branco/cinza claro
- Mesmas cores primárias, destructive, success, warning

## Detalhes técnicos
- `next-themes` já está nas dependências — usa `ThemeProvider` com `attribute="class"` e `storageKey`
- `tailwind.config.ts` já tem `darkMode: ["class"]` configurado
- Nenhuma alteração no banco de dados

