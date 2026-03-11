

# CupomSmart MG — Fase 2: Backend (Lovable Cloud + Banco de Dados)

## Pre-requisito

O projeto ainda nao tem Lovable Cloud nem Supabase conectado. Sera necessario ativar Lovable Cloud primeiro.

## O que sera construido

### 1. Ativar Lovable Cloud
- Habilitar Cloud para ter acesso a banco de dados, autenticacao, edge functions e storage

### 2. Autenticacao
- Email + senha (signup/login)
- Google OAuth
- Paginas de login e cadastro
- Protecao de rotas (redirecionar para login se nao autenticado)
- Pagina de reset de senha em `/reset-password`
- Perfil do usuario com tabela `profiles` (nome, avatar)

### 3. Tabelas do banco de dados (7 tabelas + 1 enum + 1 view)

| Tabela | Descricao |
|--------|-----------|
| `profiles` | Perfil do usuario (trigger auto-create no signup) |
| `user_roles` | Roles separadas (admin, moderator, user) com funcao `has_role` |
| `supermarkets` | Cadastro de supermercados (CNPJ, nome, endereco, logo, cor) |
| `receipts` | Cupons fiscais NFC-e escaneados |
| `products` | Produtos extraidos de cada cupom |
| `price_history` | Historico de preco por produto/supermercado |
| `product_catalog` | Catalogo global de produtos unicos |
| `shopping_lists` | Listas de compras do usuario |
| `shopping_list_items` | Itens individuais de cada lista |

### 4. RLS (Row Level Security)
- `profiles`: usuario le/edita apenas o proprio
- `user_roles`: leitura pelo proprio usuario
- `supermarkets`: leitura publica, criacao por autenticados
- `receipts`: CRUD apenas pelo dono (user_id = auth.uid())
- `products`: leitura via receipt do dono
- `price_history`: leitura publica
- `product_catalog`: leitura publica, insert por autenticados
- `shopping_lists`: CRUD pelo dono
- `shopping_list_items`: CRUD pelo dono da lista

### 5. Indices
- `supermarkets`: cnpj (unique), name
- `receipts`: access_key (unique), supermarket_id, purchase_date, user_id
- `products`: receipt_id, product_code, product_name_normalized, supermarket_id, purchase_date
- `price_history`: (product_code, supermarket_id, purchase_date), product_name_normalized
- `shopping_list_items`: shopping_list_id

### 6. Storage
- Bucket `supermarket-logos`: publico, para logos dos supermercados

### 7. Integracao no frontend
- Criar `src/integrations/supabase/` com client e types
- AuthProvider com `onAuthStateChange`
- Paginas `/login` e `/reset-password`
- ProtectedRoute wrapper nas rotas existentes
- Atualizar AppSidebar com info do usuario e botao logout

## Arquivos a criar/modificar
- Migrations SQL para todas as tabelas, enum, funcoes, RLS, indices
- `src/pages/Login.tsx` — Pagina de login/cadastro
- `src/pages/ResetPassword.tsx` — Reset de senha
- `src/components/auth/AuthProvider.tsx` — Context de autenticacao
- `src/components/auth/ProtectedRoute.tsx` — Wrapper de rota protegida
- `src/App.tsx` — Adicionar AuthProvider, rotas de login, proteger rotas
- `src/components/layout/AppSidebar.tsx` — Adicionar usuario e logout

