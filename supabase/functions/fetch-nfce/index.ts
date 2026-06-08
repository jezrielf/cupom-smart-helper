// fetch-nfce — direct fetch from SEFAZ MG portal, no Firecrawl dependency

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

// Strip "Label: " injected by some portals: "Qtde total de itens: 3.0000" → "3.0000"
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

// ─── Parser A: HTML table rows ─────────────────────────────────────────────────
// Works on the raw HTML from SEFAZ portal.
// SEFAZ MG columns: [name+code | qty (with optional label) | unit | total]
// No unit-price column — we derive it from total/qty.

function parseHtmlTable(html: string): Product[] {
  const products: Product[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 4) continue;

    const raw = cells.map((c) => stripTags(c).trim());
    const clean = raw.map(stripCellLabel);

    // col 0: product name (possibly "NAME (Codigo: CODE)")
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

    // unit: first cell between qty and total that looks like a unit code
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

// ─── Parser B: plain-text regex ───────────────────────────────────────────────
// Fallback when table structure doesn't match.
// Works on the full plain text after stripping all HTML tags.
// Pattern from SEFAZ MG:
//   "NAME (Codigo: CODE) ... QTY ... UN: UNIT ... R$ PRICE"

function parsePlainText(text: string): Product[] {
  const products: Product[] = [];

  // Strategy 1 — user-provided regex (works on stripped page text)
  const re1 =
    /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][^(]{2,}?)\(C[oó]digo:\s*(\d+)\)[\s\S]*?(\d+[.,]\d+)\s*UN:\s*(\w+)[\s\S]*?R\$\s*([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(text)) !== null) {
    const name = m[1].replace(/[|\s]+$/, "").trim();
    if (name.length < 2) continue;
    const code = m[2];
    const qty = parseBrNumber(m[3]);
    const unit = m[4].toUpperCase();
    const total = parseBrNumber(m[5]);
    if (qty <= 0 || total <= 0 || total > 50_000) continue;
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

  // Strategy 2 — pipe-separated markdown-style lines (Firecrawl legacy format)
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

// ─── Full HTML parser ──────────────────────────────────────────────────────────

function parseNfceHtml(html: string): ParsedNfce {
  // ── Access key ──
  const akMatch =
    html.match(/Chave de acesso[^<]*<[^>]*>[^<]*(\d{44})/i) ||
    html.match(/(\d{44})/);
  const accessKey = akMatch ? akMatch[1] : "";

  // ── Emitter name ── (never captures HTML attribute values)
  let emitterName = "";
  const namePatterns = [
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

  // ── CNPJ ──
  let cnpj = "";
  const cnpjM =
    html.match(/CNPJ[:\s]+([\d.\/-]+)/i) ||
    html.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjM) cnpj = cnpjM[1].replace(/[.\/-]/g, "");

  // ── Address ──
  let address = "";
  const addrM = html.match(/Endere[cç]o[^:]*:\s*([^<\n]{5,})/i);
  if (addrM) address = stripTags(addrM[1]).trim();

  // ── Purchase date ──
  let purchaseDate = new Date().toISOString();
  const dateM =
    html.match(/Emiss[aã]o[^:]*:\s*([\d\/]+\s+[\d:]+)/i) ||
    html.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (dateM) purchaseDate = parsePurchaseDate(dateM[1] ?? `${dateM[1]} ${dateM[2]}`);

  // ── Products: try table parser first, then plain-text fallback ──
  let products = parseHtmlTable(html);
  console.log(`Table parser: ${products.length} products`);

  if (products.length === 0) {
    const plainText = stripTags(html);
    products = parsePlainText(plainText);
    console.log(`Text parser: ${products.length} products`);
  }

  // ── Totals ──
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
    // ── Auth: validate JWT locally, no HTTP round-trip ──
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

    // ── Build URL from access_key if needed ──
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

    // Normalize SEFAZ MG domain variant
    url = url.replace("nfce.fazenda.mg.gov.br", "portalsped.fazenda.mg.gov.br");
    console.log("Processing URL:", url);

    // ── Fetch attempt 1: URL as-is ──
    let html = "";
    let lastStatus = 0;

    const tryFetch = async (fetchUrl: string, timeoutMs: number): Promise<string> => {
      console.log("Fetching:", fetchUrl);
      const res = await fetchWithTimeout(
        fetchUrl,
        { headers: BROWSER_HEADERS, redirect: "follow" },
        timeoutMs,
      );
      lastStatus = res.status;
      console.log(`Status: ${res.status}  Content-Type: ${res.headers.get("content-type") ?? "-"}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`HTML size: ${text.length} chars`);
        console.log(`HTML preview: ${text.slice(0, 400).replace(/\s+/g, " ")}`);
        return text;
      }
      if (res.status === 404) throw Object.assign(new Error("not_found"), { status: 404 });
      throw Object.assign(new Error(`http_${res.status}`), { status: res.status });
    };

    try {
      html = await tryFetch(url, 15000);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status === 404) {
        return new Response(
          JSON.stringify({ error: "Cupom fiscal não encontrado no portal da SEFAZ." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.warn("Attempt 1 failed:", err.message);

      // ── Fetch attempt 2: chaveNFe query param format ──
      const cleanKey = (accessKey || url.match(/p=(\d{44})/)?.[1] || "").replace(/\s/g, "");
      if (cleanKey.length === 44) {
        const altUrl = `https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?chaveNFe=${cleanKey}`;
        try {
          html = await tryFetch(altUrl, 12000);
        } catch (e2: unknown) {
          console.warn("Attempt 2 failed:", (e2 as Error).message);
        }
      }
    }

    if (!html) {
      const detail =
        lastStatus === 403
          ? "Portal da SEFAZ bloqueou o acesso. Use a aba 'Digitar' para inserir a chave manualmente."
          : lastStatus >= 500
          ? "Portal da SEFAZ está fora do ar. Tente novamente em instantes."
          : "Não foi possível acessar o portal da SEFAZ.";
      return new Response(
        JSON.stringify({ error: detail, _debug: `fetch_status=${lastStatus}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Parse ──
    const parsed = parseNfceHtml(html);
    console.log(
      `Parsed: ${parsed.item_count} products, emitter="${parsed.emitter.name}", total=${parsed.total_amount}`,
    );

    if (parsed.products.length === 0) {
      const preview = html.slice(0, 400).replace(/\s+/g, " ");
      console.warn("Zero products. Preview:", preview);
      return new Response(
        JSON.stringify({
          error:
            "HTML obtido mas nenhum produto extraído. O layout do portal pode ter mudado.",
          _debug: `html=${html.length}chars | preview=${preview}`,
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
