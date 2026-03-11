

# CupomSmart MG — Fase 3: Scanner de QR Code + Edge Function fetch-nfce

## O que sera construido

### 1. Instalar html5-qrcode (nova dependencia)

### 2. Pagina Scanner (`src/pages/Scanner.tsx`) — reescrita completa
- **Tabs**: "Camera" e "Manual"
- **Tab Camera**: componente QRScannerCamera com html5-qrcode (auto-start, botao flash, botao upload de imagem da galeria)
- **Tab Manual**: input para colar URL do QR Code OU digitar chave de acesso (44 digitos com mascara visual)
- **Estado de processamento**: loading spinner ao buscar cupom
- **Modal de previa**: apos parse, exibe resumo do cupom (supermercado, data, itens, total) com botoes "Confirmar" e "Cancelar"
- **Tratamento de erros**: toast para 404 (cupom nao encontrado), 409 (ja cadastrado), 422 (invalido), 429 (rate limit)

### 3. Edge Function `fetch-nfce` (`supabase/functions/fetch-nfce/index.ts`)
- Recebe `{ url }` ou `{ access_key }` no body
- Se receber access_key, monta a URL do portal SEFAZ MG
- Faz fetch do HTML da pagina da NFC-e
- Faz parse com DOMParser (ou regex para Deno) extraindo:
  - CNPJ, nome emitente, endereco
  - Data/hora da compra
  - Lista de produtos (codigo, nome, quantidade, unidade, preco unitario, total)
  - Totais, descontos, forma de pagamento
  - Chave de acesso
- Normaliza nomes de produtos (uppercase, remove acentos)
- Retorna JSON estruturado com todos os dados

### 4. Logica de salvamento no frontend (ao confirmar previa)
- Verifica se `access_key` ja existe em `receipts` (409)
- Busca supermercado pelo CNPJ; se nao existe, cria automaticamente
- Insere `receipt` com dados do cupom
- Insere todos `products` vinculados ao receipt
- Insere `price_history` para cada produto
- Toast de sucesso e redireciona para `/cupons`

### 5. Componentes auxiliares
- `src/components/scanner/QRScannerCamera.tsx` — wrapper do html5-qrcode
- `src/components/scanner/ManualInput.tsx` — input URL + chave de acesso
- `src/components/scanner/ReceiptPreview.tsx` — modal de previa do cupom parseado

### 6. config.toml — adicionar funcao fetch-nfce com `verify_jwt = false`

## Detalhes tecnicos

- html5-qrcode para leitura de camera (funciona em mobile e desktop)
- Edge function usa `fetch()` para buscar HTML do SEFAZ e faz parse com regex (DOMParser nao disponivel no Deno)
- URL padrao SEFAZ MG: `http://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=...`
- JWT validado na edge function via `getClaims()` para associar ao user
- Normalizacao: `text.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')`

