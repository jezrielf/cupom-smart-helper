// fetch-nfce — Firecrawl (primary) + direct fetch (fallback) + HTML parser

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ").trim();
}

function parseBrNumber(s: string): number {
  if (!s) return 0;
  const t = s.replace(/R\$\s*/gi, "").trim();
  if (!t) return 0;
  const hasDot = t.includes(".");
  const hasComma = t.includes(",");
  if (hasDot && hasComma) {
    return (
      parseFloat(
        t.lastIndexOf(",") > t.lastIndexOf(".")
          ? t.replace(/\./g, "").replace(",", ".")
          : t.replace(/,/g, ""),
      ) || 0
    );
  }
  if (hasComma) return parseFloat(t.replace(",", ".")) || 0;
  return parseFloat(t) || 0;
}

function parsePurchaseDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString();
  const p = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
  if (!p) return new Date().toISOString();
  return new Date(
    parseInt(p[3]),
    parseInt(p[2]) - 1,
    parseInt(p[1]),
    parseInt(p[4]),
    parseInt(p[5]),
    parseInt(p[6] || "0"),
  ).toISOString();
}

// Strip "Label: " prefixes injected by Firecrawl markdown conversion:
// "Qtde total de itens: 3.0000" → "3.0000"
function stripCellLabel(text: string): string {
  return text
    .replace(/^[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ ]+:\s*/i, "")
    .replace(/^R\$\s*/i, "")
    .trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Parser A: HTML table rows ────────────────────────────────────────────────
// SEFAZ MG columns: [name+code | qty | unit | total] — no unit-price column.

function parseHtmlTable(html: string): Product[] {
  const products: Product[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 4) continue;

    const raw = cells.map((c) => stripTags(c).trim());
    const clean = raw.map(stripCellLabel);

    const rawName = raw[0];
    if (!rawName || rawName.length < 3) continue;

    const nums = clean.map(parseBrNumber);

    // qty = first positive number after col 0
    const qtyIdx = nums.findIndex((v, i) => i > 0 && v > 0);
    if (qtyIdx < 0) continue;
    const qty = nums[qtyIdx];

    // total = last positive number ≤ 50 000
    let totalIdx = -1;
    for (let i = nums.length - 1; i > qtyIdx; i--) {
      if (nums[i] > 0 && nums[i] <= 50_000) { totalIdx = i; break; }
    }
    if (totalIdx < 0) continue;
    const total = nums[totalIdx];
    if (qty <= 0 || total <= 0) continue;

    // unit between qty and total
    let unit = "UN";
    for (let i = qtyIdx + 1; i < totalIdx; i++) {
      if (/^(UN|KG|LT|PC|CX|MT|GR|ML|G)\b/i.test(clean[i])) {
        unit = clean[i].toUpperCase().split(/\W/)[0];
        break;
      }
    }

    const codeMatch = rawName.match(/\(C[oó]digo:\s*(\d+)\)/i);
    const code = codeMatch ? codeMatch[1] : "";
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

  return products;
}

// ─── Parser B: plain-text regex ──────────────────────────────────────────────
// Fallback for plain text or Firecrawl markdown output.
// Works on: "NAME (Codigo: CODE) ... QTY ... UN: UNIT ... R$ PRICE"

function parsePlainText(text: string): Product[] {
  const products: Product[] = [];
  let m: RegExpExecArray | null;

  // Strategy 1 — SEFAZ MG plain-text after stripTags
  const re1 =
    /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][^(]{2,}?)\(C[oó]digo:\s*(\d+)\)[\s\S]*?(\d+[.,]\d+)\s*UN:\s*(\w+)[\s\S]*?R\$\s*([\d.,]+)/gi;
  while ((m = re1.exec(text)) !== null) {
    const name = m[1].replace(/[|\s]+$/, "").trim();
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

  // Strategy 2 — Firecrawl pipe-separated markdown format
  if (products.length === 0) {
    const re2 =
      /^[|\s]*(.+?)\s*\(C[oó]digo:\s*(\d+)\)\s*[|│]\s*[^|│]*?:\s*([\d.,]+)\s*[|│]\s*UN:\s*(\w+)\s*[|│][^|│]*?R\$\s*([\d.,]+)/gim;
    while ((m = re2.exec(text)) !== null) {
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
  }

  return products;
}

// ─── Full HTML parser ─────────────────────────────────────────────────────────

function parseNfceHtml(html: string): ParsedNfce {
  // Access key
  const akMatch =
    html.match(/Chave de acesso[^<]*<[^>]*>[^<]*(\d{44})/i) ||
    html.match(/(\d{44})/);
  const accessKey = akMatch ? akMatch[1] : "";

  // Emitter name — [^<]+ never captures HTML attribute garbage
  let emitterName = "";
  const namePatterns: RegExp[] = [
    /<[^>]+class="[^"]*NomeEmit[^"]*"[^>]*>([^<]{3,})</i,
    /<[^>]+id="[^"]*NomeEmit[^"]*"[^>]*>([^<]{3,})</i,
    /<[^>]+class="[^"]*txtTit[^"]*"[^>]*>([^<]{3,})</i,
    /<h4[^>]*>([^<]{3,})<\/h4>/i,
    /<h3[^>]*>([^<]{3,})<\/h3>/i,
    /<[^>]+class="[^"]*txtTopo[^"]*"[^>]*>([^<]{3,})</i,
    /Raz[aã]o Social[^:]*:\s*([^<\n]{3,})/i,
  ];
  for (const pat of namePatterns) {
    const nm = html.match(pat);
    if (nm) {
      const cand = stripTags(nm[1]).trim();
      if (cand.length > 3 && !/[><%{]/.test(cand) && /[A-Za-z]/.test(cand)) {
        emitterName = cand;
        break;
      }
    }
  }

  // CNPJ
  let cnpj = "";
  const cnpjM =
    html.match(/CNPJ[:\s]+([\d.\/-]+)/i) ||
    html.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjM) cnpj = cnpjM[1].replace(/[.\/-]/g, "");

  // Address
  let address = "";
  const addrM = html.match(/Endere[cç]o[^:]*:\s*([^<\n]{5,})/i);
  if (addrM) address = stripTags(addrM[1]).trim();

  // Purchase date
  let purchaseDate = new Date().toISOString();
  const dateM =
    html.match(/Emiss[aã]o[^:]*:\s*([\d\/]+\s+[\d:]+)/i) ||
    html.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (dateM) purchaseDate = parsePurchaseDate(dateM[1] ?? `${dateM[1]} ${dateM[2]}`);

  // Products: table parser first, then text fallback
  let products = parseHtmlTable(html);
  console.log(`Table parser: ${products.length} products`);

  if (products.length === 0) {
    const plainText = stripTags(html);
    products = parsePlainText(plainText);
    console.log(`Text parser (plain): ${products.length} products`);
  }

  // Also try markdown format on full content (Firecrawl output)
  if (products.length === 0) {
    products = parsePlainText(html);
    console.log(`Text parser (raw): ${products.length} products`);
  }

  // Totals
  let totalAmount = 0;
  const totalM =
    html.match(/Valor\s*total\s*R?\$?\s*([\d.,]+)/i) ||
    html.match(/TOTAL\s*R?\$?\s*([\d.,]+)/i);
  if (totalM) totalAmount = parseBrNumber(totalM[1]);
  if (!totalAmount && products.length > 0)
    totalAmount = products.reduce((s, p) => s + p.total_price, 0);

  let totalDiscount = 0;
  const discM = html.match(/Desconto[s]?\s*R?\$?\s*([\d.,]+)/i);
  if (discM) totalDiscount = parseBrNumber(discM[1]);

  // Payment: "99 - Outros" or keyword
  let paymentMethod = "";
  const payM =
    html.match(/(\d{2,3}\s*[-–]\s*(?:Dinheiro|Cart[aã]o|PIX|Outros|Cheque|Dep[oó]sito|Boleto)[^<\n]*)/i) ||
    html.match(/Forma\s*de\s*pagamento[\s\S]{0,200}?(Dinheiro|Cart[aã]o\s*(?:de\s*)?(?:[DC][eé]bito|Cr[eé]dito)|PIX|Outros)/i);
  if (payM) paymentMethod = payM[1].trim();

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

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.5,en;q=0.3",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: JWT local validation, no HTTP round-trip ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    if (token.split(".").length !== 3) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const payload = JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ──
    const body = await req.json();
    let url: string = (body.url || "").trim();
    const accessKey: string = (body.access_key || "").trim();

    if (!url && !accessKey) {
      return new Response(
        JSON.stringify({ error: "URL ou chave de acesso é obrigatória" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!url && accessKey) {
      const cleanKey = accessKey.replace(/\s/g, "");
      if (cleanKey.length !== 44 || !/^\d+$/.test(cleanKey)) {
        return new Response(
          JSON.stringify({ error: "Chave de acesso inválida. Deve conter 44 dígitos." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      url = `https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${cleanKey}`;
    }

    url = url.replace("nfce.fazenda.mg.gov.br", "portalsped.fazenda.mg.gov.br");
    console.log("Processing URL:", url);

    let html = "";
    let markdown = "";
    let lastStatus = 0;

    // ── Step 1: Firecrawl (primary — proven to access SEFAZ portal) ──
    // NOTE: do NOT use location:{country:"BR"} — causes 402 on free plan.
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (firecrawlApiKey) {
      console.log("Trying Firecrawl...");
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
              timeout: 20000,
              onlyMainContent: false,
              headers: { "Accept-Language": "pt-BR,pt;q=0.9" },
            }),
          },
          24000,
        );

        lastStatus = fcRes.status;
        console.log(`Firecrawl status: ${fcRes.status}`);

        if (fcRes.ok) {
          const d = await fcRes.json();
          markdown = d.data?.markdown || d.markdown || "";
          html = d.data?.html || d.html || "";
          console.log(`Firecrawl: markdown=${markdown.length} html=${html.length}`);
          if (markdown) console.log("Markdown preview:", markdown.slice(0, 300));
          else if (html) console.log("HTML preview:", html.slice(0, 300));
        } else {
          const errBody = await fcRes.text().catch(() => "");
          console.warn(`Firecrawl ${fcRes.status}: ${errBody.slice(0, 200)}`);
        }
      } catch (e) {
        console.warn("Firecrawl error:", e instanceof Error ? e.message : e);
      }
    }

    // ── Step 2: Direct fetch fallback ──
    if (!html && !markdown) {
      console.log("Firecrawl returned nothing — trying direct fetch...");
      try {
        const res = await fetchWithTimeout(
          url,
          { headers: BROWSER_HEADERS, redirect: "follow" },
          15000,
        );
        lastStatus = res.status;
        console.log(`Direct fetch status: ${res.status}`);
        if (res.ok) {
          html = await res.text();
          console.log(`Direct fetch: ${html.length} chars`);
          console.log("HTML preview:", html.slice(0, 300));
        } else if (res.status === 404) {
          return new Response(
            JSON.stringify({ error: "Cupom fiscal não encontrado no portal da SEFAZ." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        console.warn("Direct fetch error:", e instanceof Error ? e.message : e);
      }
    }

    if (!html && !markdown) {
      const detail =
        lastStatus === 403
          ? "Portal da SEFAZ bloqueou o acesso. Use 'Digitar' para inserir a chave manualmente."
          : lastStatus >= 500
          ? "Portal da SEFAZ está fora do ar. Tente novamente em instantes."
          : "Não foi possível acessar o portal da SEFAZ.";
      return new Response(
        JSON.stringify({ error: detail, _debug: `status=${lastStatus}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Step 3: Parse ──
    // Try HTML first (richer structure), then markdown, then plain text of either
    let parsed: ParsedNfce | null = null;

    if (html) {
      const p = parseNfceHtml(html);
      if (p.products.length > 0) parsed = p;
    }

    if (!parsed && markdown) {
      const p = parseNfceHtml(markdown); // parsers also work on markdown
      if (p.products.length > 0) parsed = p;
    }

    if (!parsed) {
      const content = html || markdown;
      const plain = stripTags(content);
      const plainProducts = parsePlainText(plain);
      if (plainProducts.length > 0) {
        // Build a minimal ParsedNfce from the plain-text results
        const p = parseNfceHtml(content); // get metadata (emitter, date, etc.)
        parsed = { ...p, products: plainProducts, item_count: plainProducts.length };
        // Recalculate total if missing
        if (!parsed.total_amount)
          parsed.total_amount = plainProducts.reduce((s, x) => s + x.total_price, 0);
      }
    }

    if (!parsed || parsed.products.length === 0) {
      const content = html || markdown;
      const preview = content.slice(0, 400).replace(/\s+/g, " ");
      console.warn("Zero products. Preview:", preview);
      return new Response(
        JSON.stringify({
          error: "HTML obtido mas nenhum produto extraído. O portal pode ter mudado de layout.",
          _debug: `html=${html.length} md=${markdown.length} | ${preview}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fill missing access_key
    if (!parsed.access_key) {
      const fromKey = accessKey.replace(/\s/g, "");
      const fromUrl = url.match(/[?&](?:p|chaveNFe)=(\d{44})/)?.[1] ?? "";
      parsed.access_key = fromKey || fromUrl;
    }

    console.log(
      `Success: ${parsed.item_count} products, emitter="${parsed.emitter.name}", total=${parsed.total_amount}`,
    );

    return new Response(
      JSON.stringify({ ...parsed, qr_code_url: url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar o cupom." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
