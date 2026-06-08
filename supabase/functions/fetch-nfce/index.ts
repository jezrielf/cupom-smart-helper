import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalize(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function parseBrNumber(s: string): number {
  if (!s) return 0;
  const t = s.replace(/R\$\s*/gi, "").trim();
  if (!t) return 0;
  const hasDot = t.includes(".");
  const hasComma = t.includes(",");
  if (hasDot && hasComma) {
    return parseFloat(
      t.lastIndexOf(",") > t.lastIndexOf(".")
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "")
    ) || 0;
  }
  if (hasComma) return parseFloat(t.replace(",", ".")) || 0;
  // dot only: parseFloat handles both 12.99 and 12.990 correctly as decimals
  return parseFloat(t) || 0;
}

function parsePurchaseDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString();
  const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
  if (!parts) return new Date().toISOString();
  return new Date(
    parseInt(parts[3]),
    parseInt(parts[2]) - 1,
    parseInt(parts[1]),
    parseInt(parts[4]),
    parseInt(parts[5]),
    parseInt(parts[6] || "0")
  ).toISOString();
}

interface Product {
  product_code: string;
  product_name: string;
  product_name_normalized: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

interface ParsedNfce {
  access_key: string;
  emitter: { name: string; cnpj: string; address: string };
  purchase_date: string;
  products: Product[];
  total_amount: number;
  total_discount: number;
  payment_method: string;
  item_count: number;
}

// ---------- Markdown parser ----------

// Strip "Label: " prefix injected by Firecrawl when it inlines table headers into cells.
// e.g. "Qtde total de itens: 3.0000" → "3.0000"
//      "Valor total RS: R$ 17,94"    → "17,94"
function stripCellLabel(text: string): string {
  return text
    .replace(/^[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ ]+:\s*/i, "")
    .replace(/^R\$\s*/i, "")
    .trim();
}

function parseNfceMarkdown(markdown: string): ParsedNfce {
  const products: Product[] = [];

  // Access key (44 consecutive digits)
  const accessKeyMatch =
    markdown.match(/Chave de acesso[^:\n]*:?\s*[\n\s]*([\d\s]{44,55})/) ||
    markdown.match(/(\d{44})/);
  const accessKey = accessKeyMatch
    ? accessKeyMatch[1].replace(/\s/g, "").slice(0, 44)
    : "";

  // Emitter name
  let emitterName = "";
  const nameMatch =
    markdown.match(/^#\s+(.+)/m) ||
    markdown.match(/Raz[aã]o Social[^:]*:\s*([^\n]+)/i) ||
    markdown.match(/\*\*([^*\n]{5,})\*\*/);
  if (nameMatch) emitterName = nameMatch[1].trim();

  let cnpj = "";
  const cnpjMatch =
    markdown.match(/CNPJ[:\s]+([\d.\/-]+)/i) ||
    markdown.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) cnpj = cnpjMatch[1].replace(/[.\/-]/g, "");

  let address = "";
  const addrMatch = markdown.match(/Endere[cç]o[^:]*:\s*([^\n]+)/i);
  if (addrMatch) address = addrMatch[1].trim();

  let purchaseDate = new Date().toISOString();
  const dateMatch =
    markdown.match(/Emiss[aã]o[^:]*:\s*([\d\/]+ [\d:]+)/i) ||
    markdown.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/);
  if (dateMatch) purchaseDate = parsePurchaseDate(dateMatch[1]);

  // ── Strategy 1: SEFAZ MG pipe format ──────────────────────────────────────
  // Firecrawl converts the HTML table to markdown and inlines the column header
  // into each cell: "NAME (Codigo: CODE) | Qtde total de itens: QTY | UN: UNIT | Valor total RS: R$ PRICE"
  const sefazMgRegex =
    /^[|\s]*(.+?)\s*\(C[oó]digo:\s*(\d+)\)\s*\|[^|]*?:\s*([\d.,]+)\s*\|\s*UN:\s*(\w+)\s*\|[^|]*?R\$\s*([\d.,]+)/gim;
  let m: RegExpExecArray | null;
  while ((m = sefazMgRegex.exec(markdown)) !== null) {
    const name = m[1].replace(/^[|*\s>]+/, "").trim();
    if (name.length < 2) continue;
    const qty = parseBrNumber(m[3]);
    const unit = m[4].toUpperCase();
    const total = parseBrNumber(m[5]);
    if (qty <= 0 || total <= 0 || total > 50_000) continue;
    products.push({
      product_code: m[2],
      product_name: name,
      product_name_normalized: normalize(name),
      quantity: qty,
      unit,
      unit_price: parseFloat((total / qty).toFixed(4)),
      total_price: total,
    });
  }

  // ── Strategy 2: generic 4-column markdown table ────────────────────────────
  // Columns: name | qty | unit | total  (with optional label prefixes in cells)
  if (products.length === 0) {
    const tableRow4 = /^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/gm;
    while ((m = tableRow4.exec(markdown)) !== null) {
      const cols = [m[1], m[2], m[3], m[4]].map((c) => c.trim());
      if (cols.some((c) => /^[-:]+$/.test(c))) continue; // separator row
      const cleaned = cols.map(stripCellLabel);
      const qty = parseBrNumber(cleaned[1]);
      const total = parseBrNumber(cleaned[3]);
      const name = cols[0].replace(/\s*\(C[oó]digo:\s*\d+\)/i, "").replace(/^[|*\s>]+/, "").trim();
      const codeMatch = cols[0].match(/\(C[oó]digo:\s*(\d+)\)/i);
      const unit = /^(UN|KG|LT|PC|CX|MT|GR|ML)\b/i.test(cleaned[2]) ? cleaned[2].toUpperCase() : "UN";
      if (name.length < 2 || qty <= 0 || total <= 0 || total > 50_000) continue;
      products.push({
        product_code: codeMatch ? codeMatch[1] : "",
        product_name: name,
        product_name_normalized: normalize(name),
        quantity: qty,
        unit,
        unit_price: parseFloat((total / qty).toFixed(4)),
        total_price: total,
      });
    }
  }

  // ── Strategy 3: 6-column table (other state portals) ──────────────────────
  if (products.length === 0) {
    const tableRow6 = /^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/gm;
    while ((m = tableRow6.exec(markdown)) !== null) {
      const cols = [m[1], m[2], m[3], m[4], m[5], m[6]].map((c) => c.trim());
      if (cols.some((c) => /^[-:]+$/.test(c))) continue;
      const nums = cols.map((c) => parseBrNumber(stripCellLabel(c)));
      let nameIdx = -1, maxLen = 0;
      cols.forEach((c, i) => { if (!nums[i] && c.length > maxLen) { maxLen = c.length; nameIdx = i; } });
      if (nameIdx === -1) continue;
      const positives = nums.map((v, i) => ({ i, v })).filter((x) => x.v > 0 && x.v < 50_000);
      if (positives.length < 2) continue;
      const qty = positives[0].v;
      const total = positives[positives.length - 1].v;
      const name = cols[nameIdx].replace(/^\(?\d+\)?\s*/, "").trim();
      if (name.length < 2) continue;
      const unitIdx = cols.findIndex((c, i) => i !== nameIdx && /^(UN|KG|LT|PC|CX|MT|GR|ML)\b/i.test(c.trim()));
      products.push({
        product_code: "",
        product_name: name,
        product_name_normalized: normalize(name),
        quantity: qty,
        unit: unitIdx >= 0 ? cols[unitIdx].trim().toUpperCase() : "UN",
        unit_price: parseFloat((total / qty).toFixed(4)),
        total_price: total,
      });
    }
  }

  // Totals
  let totalAmount = 0;
  const totalMatch =
    markdown.match(/Valor\s*[Tt]otal\s*R\$[^|]*?R?\$?\s*([\d.,]+)/i) ||
    markdown.match(/Valor\s*[Tt]otal[^R\d]*(R\$\s*)?([\d.,]+)/i) ||
    markdown.match(/TOTAL[^R\d]*(R\$\s*)?([\d.,]+)/i);
  if (totalMatch) totalAmount = parseBrNumber(totalMatch[2] || totalMatch[1]);
  if (!totalAmount && products.length > 0)
    totalAmount = products.reduce((s, p) => s + p.total_price, 0);

  let totalDiscount = 0;
  const discountMatch = markdown.match(/Desconto[s]?[^R\d]*(R\$\s*)?([\d.,]+)/i);
  if (discountMatch) totalDiscount = parseBrNumber(discountMatch[2] || discountMatch[1]);

  // Payment: "99 - Outros", "01 - Dinheiro", etc.
  let paymentMethod = "";
  const payMatch =
    markdown.match(/(\d{2,3}\s*[-–]\s*(?:Dinheiro|Cart[aã]o|PIX|Outros|Cheque|Dep[oó]sito|Boleto)[^\n]*)/i) ||
    markdown.match(/Forma[^:]*:\s*([^\n|]{3,50})/i);
  if (payMatch) paymentMethod = payMatch[1].trim();

  return {
    access_key: accessKey,
    emitter: { name: emitterName, cnpj, address },
    purchase_date: purchaseDate,
    products,
    total_amount: totalAmount,
    total_discount: totalDiscount,
    payment_method: paymentMethod,
    item_count: products.length,
  };
}

// ---------- HTML regex parser ----------

// Extract safe text from an HTML match — never return raw attribute values.
// Uses [^<]+ to stop at the next tag, avoiding capturing garbage like "5%;">".
function safeText(match: RegExpMatchArray | null): string {
  if (!match) return "";
  return stripTags(match[1] ?? match[0]).trim();
}

function parseNfceHtml(html: string): ParsedNfce {
  const products: Product[] = [];

  // Access key
  const accessKeyMatch =
    html.match(/Chave de acesso[^<]*<[^>]*>[^<]*(\d{44})/i) ||
    html.match(/(\d{44})/);
  const accessKey = accessKeyMatch ? accessKeyMatch[1] : "";

  // ── Emitter name ──────────────────────────────────────────────────────────
  // Try SEFAZ MG classes before falling through to generic patterns.
  // IMPORTANT: use [^<]+ so we never capture attribute values or nested tags.
  let emitterName = "";
  const emitterPatterns = [
    /<[^>]+class="[^"]*NomeEmit[^"]*"[^>]*>([^<]{3,})</i,
    /<[^>]+id="[^"]*NomeEmit[^"]*"[^>]*>([^<]{3,})</i,
    /<[^>]+class="[^"]*txtTit[^"]*"[^>]*>([^<]{3,})</i,
    /<[^>]+class="[^"]*txtTopo[^"]*"[^>]*>([^<]{3,})</i,
    /Raz[aã]o Social[^:]*:\s*([^<\n]{3,})/i,
  ];
  for (const pat of emitterPatterns) {
    const m = html.match(pat);
    if (m) {
      const candidate = stripTags(m[1]).trim();
      // Reject if it looks like an HTML fragment (contains >  or only digits/symbols)
      if (candidate.length > 3 && !/[><%]/.test(candidate) && /[A-Za-z]/.test(candidate)) {
        emitterName = candidate;
        break;
      }
    }
  }

  let cnpj = "";
  const cnpjMatch =
    html.match(/CNPJ[:\s]+([\d.\/-]+)/i) ||
    html.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) cnpj = cnpjMatch[1].replace(/[.\/-]/g, "");

  let address = "";
  const addrMatch = html.match(/Endere[cç]o[^:]*:\s*([^<\n]{5,})/i);
  if (addrMatch) address = stripTags(addrMatch[1]).trim();

  let purchaseDate = new Date().toISOString();
  const dateMatch =
    html.match(/Emiss[aã]o[^:]*:\s*([\d\/]+\s+[\d:]+)/i) ||
    html.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (dateMatch) purchaseDate = parsePurchaseDate(dateMatch[1] ?? `${dateMatch[1]} ${dateMatch[2]}`);

  // ── Table-based products ───────────────────────────────────────────────────
  // SEFAZ MG columns: [name+code, qty, unit, total]   (NO unit-price column)
  // Other portals:    [name, qty, unit_price, total, unit, ...]
  // Strategy: strip embedded labels, find qty as first number, total as last,
  // unit as any UN/KG/… column between them. Never require unitPrice > 0.
  const productBlocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const block of productBlocks) {
    const tdMatches = block.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!tdMatches || tdMatches.length < 4) continue;

    // Raw cell text
    const rawTexts = tdMatches.map((c) => stripTags(c).trim());
    // Strip "Label: " prefixes (e.g. "Qtde total de itens: 3.0000" → "3.0000")
    const cleanTexts = rawTexts.map(stripCellLabel);

    // Column 0 = product name (possibly with "(Codigo: XXX)")
    const rawName = rawTexts[0];
    if (!rawName || rawName.length < 3) continue;

    // Numeric values per cell (after label stripping)
    const numVals = cleanTexts.map(parseBrNumber);

    // qty: first positive number in columns 1..n
    const qtyIdx = numVals.findIndex((v, i) => i > 0 && v > 0);
    if (qtyIdx < 0) continue;
    const qty = numVals[qtyIdx];

    // total: last positive number ≤ 50 000
    let totalIdx = -1;
    for (let i = numVals.length - 1; i > qtyIdx; i--) {
      if (numVals[i] > 0 && numVals[i] <= 50_000) { totalIdx = i; break; }
    }
    if (totalIdx < 0) continue;
    const total = numVals[totalIdx];

    if (qty <= 0 || total <= 0) continue;

    // unit: first cell between qtyIdx and totalIdx whose text is a known unit
    let unit = "UN";
    for (let i = qtyIdx + 1; i < totalIdx; i++) {
      if (/^(UN|KG|LT|PC|CX|MT|GR|ML|G)\b/i.test(cleanTexts[i])) {
        unit = cleanTexts[i].toUpperCase().split(/\W/)[0];
        break;
      }
    }

    // Extract code from "(Codigo: XXXXX)" pattern in name cell
    const codeInName = rawName.match(/\(C[oó]digo:\s*(\d+)\)/i);
    const code = codeInName ? codeInName[1] : "";
    const name = rawName.replace(/\s*\(C[oó]digo:\s*\d+\)/i, "").trim();
    if (name.length < 2) continue;

    products.push({
      product_code: code,
      product_name: name,
      product_name_normalized: normalize(name),
      quantity: qty,
      unit,
      unit_price: parseFloat((total / qty).toFixed(4)),
      total_price: total,
    });
  }

  // ── Span-based layout (older portals) ─────────────────────────────────────
  if (products.length === 0) {
    const spanBlockRegex =
      /<span[^>]*class="[^"]*txtTit[^"]*"[^>]*>([^<]+)<\/span>([\s\S]*?)(?=<span[^>]*class="[^"]*txtTit|id="linhaTotal"|<\/div>)/gi;
    let sm: RegExpExecArray | null;
    while ((sm = spanBlockRegex.exec(html)) !== null) {
      const nameRaw = sm[1].trim();
      const rest = sm[2];
      const qm = rest.match(/Qtde[^:]*:\s*([\d.,]+)/i);
      const um = rest.match(/\bUN[^:]*:\s*(\w+)/i);
      const upm = rest.match(/Vl\.?\s*Unit[^:]*:\s*R?\$?\s*([\d.,]+)/i);
      const tm = rest.match(/Vl\.?\s*Total[^:]*:\s*R?\$?\s*([\d.,]+)/i);
      if (!nameRaw || !qm) continue;
      const codeMatch = nameRaw.match(/^\((\d+)\)\s*/);
      const code = codeMatch ? codeMatch[1] : "";
      const name = (codeMatch ? nameRaw.replace(codeMatch[0], "") : nameRaw).trim();
      const qty = parseBrNumber(qm[1]);
      const unitPrice = upm ? parseBrNumber(upm[1]) : 0;
      const total = tm ? parseBrNumber(tm[1]) : qty * unitPrice;
      if (name.length < 2 || qty <= 0 || total <= 0 || total > 50_000) continue;
      products.push({
        product_code: code,
        product_name: name,
        product_name_normalized: normalize(name),
        quantity: qty,
        unit: um ? um[1].toUpperCase() : "UN",
        unit_price: unitPrice || parseFloat((total / qty).toFixed(4)),
        total_price: total,
      });
    }
  }

  // Totals
  let totalAmount = 0;
  const totalMatch =
    html.match(/Valor\s*total\s*R?\$?\s*([\d.,]+)/i) ||
    html.match(/TOTAL\s*R?\$?\s*([\d.,]+)/i);
  if (totalMatch) totalAmount = parseBrNumber(totalMatch[1]);
  if (!totalAmount && products.length > 0)
    totalAmount = products.reduce((s, p) => s + p.total_price, 0);

  let totalDiscount = 0;
  const discountMatch = html.match(/Desconto[s]?\s*R?\$?\s*([\d.,]+)/i);
  if (discountMatch) totalDiscount = parseBrNumber(discountMatch[1]);

  // Payment: "99 - Outros" pattern or keyword list
  let paymentMethod = "";
  const payMatch =
    html.match(/(\d{2,3}\s*[-–]\s*(?:Dinheiro|Cart[aã]o|PIX|Outros|Cheque|Dep[oó]sito|Boleto)[^<\n]*)/i) ||
    html.match(/Forma\s*de\s*pagamento[\s\S]{0,200}?(Dinheiro|Cart[aã]o\s*de\s*(?:[DC][eé]bito|Cr[eé]dito)|PIX|Outros)/i);
  if (payMatch) paymentMethod = payMatch[1].trim();

  return {
    access_key: accessKey,
    emitter: { name: emitterName, cnpj, address },
    purchase_date: purchaseDate,
    products,
    total_amount: totalAmount,
    total_discount: totalDiscount,
    payment_method: paymentMethod,
    item_count: products.length,
  };
}

// ---------- Fetch with timeout ----------

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    let url = body.url || "";
    const accessKey = body.access_key || "";

    if (!url && !accessKey) {
      return new Response(
        JSON.stringify({ error: "URL ou chave de acesso é obrigatória" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!url && accessKey) {
      const cleanKey = accessKey.replace(/\s/g, "");
      if (cleanKey.length !== 44 || !/^\d+$/.test(cleanKey)) {
        return new Response(
          JSON.stringify({ error: "Chave de acesso inválida. Deve conter 44 dígitos." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      url = `https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${cleanKey}`;
    }

    if (!url.includes("nfce") && !url.includes("nfe") && !url.includes("fazenda")) {
      try { new URL(url); } catch {
        return new Response(
          JSON.stringify({ error: "URL inválida" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    url = url.replace("nfce.fazenda.mg.gov.br", "portalsped.fazenda.mg.gov.br");
    console.log("Processing URL:", url);

    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    let markdown = "";
    let html = "";
    let parsed: ParsedNfce | null = null;

    // ===== Step 1: Firecrawl — BR location + html (follows JSF redirects, avoids SEFAZ geo-block) =====
    let firecrawlStatus = 0;
    let firecrawlError = "";
    if (firecrawlApiKey) {
      console.log("Trying Firecrawl (BR location, html+markdown)...");
      try {
        const fcRes = await fetchWithTimeout(
          "https://api.firecrawl.dev/v1/scrape",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url,
              formats: ["markdown", "html"],
              waitFor: 5000,
              timeout: 22000,
              onlyMainContent: false,
              // Use Brazilian IPs — SEFAZ MG blocks foreign datacenter ranges
              location: { country: "BR", languages: ["pt-BR", "pt"] },
              headers: {
                "Accept-Language": "pt-BR,pt;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
            }),
          },
          26000
        );

        firecrawlStatus = fcRes.status;
        if (fcRes.ok) {
          const fcData = await fcRes.json();
          markdown = fcData.data?.markdown || fcData.markdown || "";
          html = fcData.data?.html || fcData.html || "";
          console.log(`Firecrawl OK (${fcRes.status}) — markdown: ${markdown.length} chars, html: ${html.length} chars`);
          // Log first 300 chars to help debug parsing issues
          if (markdown) console.log("Markdown preview:", markdown.slice(0, 300));
          else if (html) console.log("HTML preview:", html.slice(0, 300));
        } else {
          const errBody = await fcRes.text().catch(() => "");
          firecrawlError = errBody.slice(0, 300);
          console.warn(`Firecrawl ${fcRes.status}:`, firecrawlError);
        }
      } catch (e) {
        firecrawlError = e instanceof Error ? e.message : String(e);
        console.warn("Firecrawl error:", firecrawlError);
      }
    }

    // ===== Step 2: Parse markdown =====
    if (markdown) {
      const mdResult = parseNfceMarkdown(markdown);
      if (mdResult.products.length > 0) {
        parsed = mdResult;
        console.log(`Markdown parse: ${parsed.item_count} products`);
      } else {
        console.warn("Markdown parse found 0 products");
      }
    }

    // ===== Step 3: Parse HTML (Firecrawl rendered) =====
    if (!parsed && html) {
      const htmlResult = parseNfceHtml(html);
      if (htmlResult.products.length > 0) {
        parsed = htmlResult;
        console.log(`Firecrawl HTML parse: ${parsed.item_count} products`);
      } else {
        console.warn("Firecrawl HTML parse found 0 products");
      }
    }

    // ===== Step 4: Native fetch fallback =====
    if (!parsed) {
      console.log("Trying native fetch...");
      try {
        const nativeRes = await fetchWithTimeout(
          url,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/91.0.4472.120 Mobile Safari/537.36",
              Accept: "text/html,application/xhtml+xml",
            },
            redirect: "follow",
          },
          12000
        );

        if (!nativeRes.ok) {
          if (nativeRes.status === 404) {
            return new Response(
              JSON.stringify({ error: "Cupom fiscal não encontrado" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          console.warn("Native fetch status:", nativeRes.status);
        } else {
          const nativeHtml = await nativeRes.text();
          console.log(`Native fetch: ${nativeHtml.length} chars`);
          const nativeResult = parseNfceHtml(nativeHtml);
          if (nativeResult.products.length > 0) {
            parsed = nativeResult;
            console.log(`Native HTML parse: ${parsed.item_count} products`);
          } else {
            console.warn("Native HTML parse found 0 products");
          }
        }
      } catch (fetchError) {
        console.warn("Native fetch error:", fetchError instanceof Error ? fetchError.message : fetchError);
      }
    }

    // ===== Final check =====
    if (!parsed || parsed.products.length === 0) {
      let detail: string;
      let debugHint: string;

      if (!markdown && !html) {
        // Nothing was fetched at all
        if (firecrawlStatus >= 400) {
          detail = `Portal da SEFAZ inacessível (Firecrawl ${firecrawlStatus}). Tente novamente.`;
          debugHint = `firecrawl_status=${firecrawlStatus} error=${firecrawlError.slice(0, 100)}`;
        } else if (firecrawlError) {
          detail = "Não foi possível acessar o portal da SEFAZ. Verifique sua conexão.";
          debugHint = `firecrawl_error=${firecrawlError.slice(0, 100)}`;
        } else {
          detail = "O portal da SEFAZ não retornou dados. Tente novamente em instantes.";
          debugHint = "all_empty";
        }
      } else {
        // Content was fetched but products weren't found — structure mismatch
        detail = "Não foi possível extrair os produtos. O portal pode ter alterado seu layout.";
        debugHint = `markdown=${markdown.length}chars html=${html.length}chars preview=${(markdown || html).slice(0, 150).replace(/\s+/g, " ")}`;
      }

      console.error("No products. Debug:", debugHint);
      return new Response(
        JSON.stringify({ error: detail, _debug: debugHint }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fill missing access key from URL or input
    if (!parsed.access_key && accessKey) {
      parsed.access_key = accessKey.replace(/\s/g, "");
    }
    if (!parsed.access_key && url) {
      const urlKeyMatch = url.match(/p=(\d{44})/);
      if (urlKeyMatch) parsed.access_key = urlKeyMatch[1];
    }

    return new Response(
      JSON.stringify({ ...parsed, qr_code_url: url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-nfce unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar o cupom" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
