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

function parseNfceMarkdown(markdown: string): ParsedNfce {
  const products: Product[] = [];

  // Access key
  const accessKeyMatch =
    markdown.match(/Chave de acesso[^:\n]*:?\s*[\n\s]*([\d\s]{44,55})/) ||
    markdown.match(/(\d{44})/);
  const accessKey = accessKeyMatch
    ? accessKeyMatch[1].replace(/\s/g, "").slice(0, 44)
    : "";

  // Emitter
  let emitterName = "";
  const nameMatch =
    markdown.match(/^#\s+(.+)/m) ||
    markdown.match(/Raz[aã]o Social[^:]*:\s*([^\n]+)/i) ||
    markdown.match(/\*\*([^*]+)\*\*/);
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
    markdown.match(/Data[^:]*:\s*([\d\/]+ [\d:]+)/i) ||
    markdown.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/);
  if (dateMatch) purchaseDate = parsePurchaseDate(dateMatch[1]);

  // Markdown table rows: | col1 | col2 | col3 | col4 | col5 | col6 |
  const tableRowRegex = /^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/gm;
  let m: RegExpExecArray | null;
  while ((m = tableRowRegex.exec(markdown)) !== null) {
    const cols = [m[1], m[2], m[3], m[4], m[5], m[6]].map((c) => c.trim());
    // Skip header/separator rows
    if (cols.some((c) => /^[-:]+$/.test(c)) || cols[0].toLowerCase().includes("c[oó]d")) continue;

    // Try to identify columns — look for numeric values
    const nums = cols.map((c) => parseBrNumber(c));
    // Heuristic: name is the longest non-numeric column
    let nameIdx = -1;
    let maxLen = 0;
    cols.forEach((c, i) => {
      if (isNaN(nums[i]) || nums[i] === 0) {
        if (c.length > maxLen) { maxLen = c.length; nameIdx = i; }
      }
    });
    if (nameIdx === -1) continue;

    const name = cols[nameIdx];
    if (name.length < 2) continue;

    // Find qty, unit_price, total (last two numerics tend to be prices)
    const numericCols = cols.map((c, i) => ({ i, v: parseBrNumber(c) })).filter((x) => x.v > 0);
    if (numericCols.length < 2) continue;

    const qty = numericCols[0]?.v || 1;
    const unitPrice = numericCols[numericCols.length - 2]?.v || 0;
    const total = numericCols[numericCols.length - 1]?.v || qty * unitPrice;

    // Unit column
    const unitIdx = cols.findIndex((c, i) => i !== nameIdx && /^(UN|KG|LT|PC|CX|MT|GR|ML|G\b)/i.test(c.trim()));
    const unit = unitIdx >= 0 ? cols[unitIdx].trim().toUpperCase() : "UN";

    // Code
    const codeIdx = cols.findIndex((c, i) => i !== nameIdx && /^\d+$/.test(c.trim()) && c.trim().length <= 13);
    const code = codeIdx >= 0 ? cols[codeIdx].trim() : "";

    const cleanName = name.replace(/^\(?\d+\)?\s*/, "").trim();
    products.push({
      product_code: code,
      product_name: cleanName,
      product_name_normalized: normalize(cleanName),
      quantity: qty,
      unit,
      unit_price: unitPrice,
      total_price: total,
    });
  }

  // Inline product pattern: "NOME QTD UN R$ PRICE"
  if (products.length === 0) {
    const inlineRegex =
      /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9 .\/\-]{3,})\s+([\d,]+)\s+(UN|KG|LT|PC|CX|MT|GR|ML)\s+(?:R\$\s*)?([\d.,]+)\s+(?:R\$\s*)?([\d.,]+)/gi;
    while ((m = inlineRegex.exec(markdown)) !== null) {
      const name = m[1].trim();
      const qty = parseBrNumber(m[2]);
      const unit = m[3].toUpperCase();
      const unitPrice = parseBrNumber(m[4]);
      const total = parseBrNumber(m[5]);
      products.push({
        product_code: "",
        product_name: name,
        product_name_normalized: normalize(name),
        quantity: qty,
        unit,
        unit_price: unitPrice,
        total_price: total,
      });
    }
  }

  // Totals
  let totalAmount = 0;
  const totalMatch =
    markdown.match(/Valor\s*[Tt]otal[^R\d]*(R\$\s*)?([\d.,]+)/i) ||
    markdown.match(/TOTAL[^R\d]*(R\$\s*)?([\d.,]+)/i);
  if (totalMatch) totalAmount = parseBrNumber(totalMatch[2] || totalMatch[1]);
  if (!totalAmount && products.length > 0)
    totalAmount = products.reduce((s, p) => s + p.total_price, 0);

  let totalDiscount = 0;
  const discountMatch = markdown.match(/Desconto[s]?[^R\d]*(R\$\s*)?([\d.,]+)/i);
  if (discountMatch) totalDiscount = parseBrNumber(discountMatch[2] || discountMatch[1]);

  let paymentMethod = "";
  const payMatch = markdown.match(
    /Forma\s*de\s*[Pp]agamento[\s\S]{0,100}?(Dinheiro|Cart[aã]o\s*de\s*[DC][eé]bito|Cart[aã]o\s*de\s*Cr[eé]dito|PIX|Outros)/i
  );
  if (payMatch) paymentMethod = payMatch[1];

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

function parseNfceHtml(html: string): ParsedNfce {
  const products: Product[] = [];

  const accessKeyMatch =
    html.match(/Chave de acesso[^<]*<[^>]*>[\s\S]*?(\d{44})/i) ||
    html.match(/(\d{44})/);
  const accessKey = accessKeyMatch ? accessKeyMatch[1] : "";

  let emitterName = "";
  const nameMatch = html.match(/<div[^>]*class="txtTopo"[^>]*>([\s\S]*?)<\/div>/i);
  if (nameMatch) emitterName = stripTags(nameMatch[1]).trim();
  if (!emitterName) {
    const nm2 =
      html.match(/Raz[aã]o Social[^:]*:\s*([^<\n]+)/i) ||
      html.match(/<div[^>]*NFCe_Emitente[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i);
    if (nm2) emitterName = stripTags(nm2[1]).trim();
  }

  let cnpj = "";
  const cnpjMatch =
    html.match(/CNPJ:\s*([\d.\/-]+)/i) ||
    html.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) cnpj = cnpjMatch[1].replace(/[.\/-]/g, "");

  let address = "";
  const addrMatch = html.match(/Endere[cç]o[^:]*:\s*([^<\n]+)/i);
  if (addrMatch) address = stripTags(addrMatch[1]).trim();

  let purchaseDate = new Date().toISOString();
  const dateMatch =
    html.match(/Emiss[aã]o:\s*([\d\/]+\s+[\d:]+)/i) ||
    html.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (dateMatch) {
    const ds = dateMatch[1] || `${dateMatch[1]} ${dateMatch[2]}`;
    purchaseDate = parsePurchaseDate(ds);
  }

  // Table-based layout
  const productBlocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const block of productBlocks) {
    const cols = block.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cols || cols.length < 4) continue;
    const texts = cols.map((c) => stripTags(c).trim());
    const nameCandidate = texts[0];
    const qtyCandidate = parseBrNumber(texts[1]);
    const unitPriceCandidate = parseBrNumber(texts[2]);
    const totalCandidate = parseBrNumber(texts[3]);
    if (nameCandidate && qtyCandidate > 0 && unitPriceCandidate > 0) {
      const codeMatch = nameCandidate.match(/^\((\d+)\)\s*/);
      const code = codeMatch ? codeMatch[1] : "";
      const name = (codeMatch ? nameCandidate.replace(codeMatch[0], "") : nameCandidate).trim();
      if (name.length >= 2) {
        products.push({
          product_code: code,
          product_name: name,
          product_name_normalized: normalize(name),
          quantity: qtyCandidate,
          unit: texts[4] || "UN",
          unit_price: unitPriceCandidate,
          total_price: totalCandidate || qtyCandidate * unitPriceCandidate,
        });
      }
    }
  }

  // Span-based layout
  if (products.length === 0) {
    // Pattern: <span class="txtCodigo">name</span> followed by qty/price spans
    const spanBlockRegex =
      /<span[^>]*class="[^"]*txtTit[^"]*"[^>]*>([\s\S]*?)<\/span>([\s\S]*?)(?=<span[^>]*class="[^"]*txtTit|id="linhaTotal"|<\/div>)/gi;
    let sm: RegExpExecArray | null;
    while ((sm = spanBlockRegex.exec(html)) !== null) {
      const nameRaw = stripTags(sm[1]).trim();
      const rest = sm[2];
      const qm = rest.match(/Qtde\.?:?\s*([\d.,]+)/i);
      const um = rest.match(/\bUN\.?:?\s*(\w+)/i);
      const upm = rest.match(/Vl\.?\s*Unit\.?[^R\d]*(R\$\s*)?([\d.,]+)/i);
      const tm = rest.match(/Vl\.?\s*Total[^R\d]*(R\$\s*)?([\d.,]+)/i);
      if (nameRaw && qm && upm) {
        const codeMatch = nameRaw.match(/^\((\d+)\)\s*/);
        const code = codeMatch ? codeMatch[1] : "";
        const name = (codeMatch ? nameRaw.replace(codeMatch[0], "") : nameRaw).trim();
        const qty = parseBrNumber(qm[1]);
        const unitPrice = parseBrNumber(upm[2] || upm[1]);
        const total = tm ? parseBrNumber(tm[2] || tm[1]) : qty * unitPrice;
        if (name.length >= 2) {
          products.push({
            product_code: code,
            product_name: name,
            product_name_normalized: normalize(name),
            quantity: qty,
            unit: um ? um[1].toUpperCase() : "UN",
            unit_price: unitPrice,
            total_price: total,
          });
        }
      }
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

  let paymentMethod = "";
  const payMatch = html.match(
    /Forma\s*de\s*pagamento[\s\S]*?(Dinheiro|Cart[aã]o\s*de\s*[DC][eé]bito|Cart[aã]o\s*de\s*Cr[eé]dito|PIX|Outros)/i
  );
  if (payMatch) paymentMethod = payMatch[1];

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

    // ===== Step 1: Firecrawl — markdown + rawHtml (JSF renders server-side, no JS needed) =====
    if (firecrawlApiKey) {
      console.log("Trying Firecrawl markdown+rawHtml...");
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
              formats: ["markdown", "rawHtml"],
              waitFor: 3000,
              timeout: 20000,
              onlyMainContent: false,
            }),
          },
          24000
        );

        if (fcRes.ok) {
          const fcData = await fcRes.json();
          markdown = fcData.data?.markdown || fcData.markdown || "";
          html = fcData.data?.rawHtml || fcData.rawHtml || fcData.data?.html || fcData.html || "";
          console.log(`Firecrawl OK — markdown: ${markdown.length} chars, rawHtml: ${html.length} chars`);
        } else {
          const errBody = await fcRes.text().catch(() => "");
          console.warn(`Firecrawl status ${fcRes.status}:`, errBody.slice(0, 200));
        }
      } catch (e) {
        console.warn("Firecrawl error:", e instanceof Error ? e.message : e);
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
      const detail = !markdown && !html
        ? "Não foi possível acessar o portal da SEFAZ. Verifique sua conexão ou tente novamente."
        : "Não foi possível extrair os produtos do cupom. O portal pode ter alterado seu layout.";
      console.error("No products found after all attempts");
      return new Response(
        JSON.stringify({ error: detail }),
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
