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
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Firecrawl extract with retry ----------

const FIRECRAWL_SCHEMA = {
  type: "object",
  properties: {
    emitter_name: { type: "string" },
    emitter_cnpj: { type: "string" },
    emitter_address: { type: "string" },
    purchase_date: { type: "string" },
    access_key: { type: "string" },
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          unit_price: { type: "number" },
          total_price: { type: "number" },
        },
      },
    },
    total_amount: { type: "number" },
    total_discount: { type: "number" },
    payment_method: { type: "string" },
  },
};

const FIRECRAWL_PROMPT =
  "Extraia os dados desta nota fiscal eletrônica (NFC-e) brasileira. Inclua TODOS os produtos listados com nome, código, quantidade, unidade (UN, KG, etc), preço unitário e preço total. O CNPJ deve conter apenas dígitos (sem pontos, barras ou hífens). A data de compra deve estar no formato DD/MM/AAAA HH:MM:SS. A chave de acesso tem 44 dígitos numéricos.";

interface FirecrawlResult {
  access_key: string;
  emitter: { name: string; cnpj: string; address: string };
  purchase_date: string;
  products: Array<{
    product_code: string;
    product_name: string;
    product_name_normalized: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }>;
  total_amount: number;
  total_discount: number;
  payment_method: string;
  item_count: number;
}

function parsePurchaseDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString();
  const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
  if (!parts) return new Date().toISOString();
  return new Date(
    parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]),
    parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6] || "0")
  ).toISOString();
}

function buildResultFromExtracted(extracted: any): FirecrawlResult | null {
  if (!extracted?.products || extracted.products.length === 0) return null;

  const products = extracted.products.map((p: any) => ({
    product_code: p.code || "",
    product_name: p.name || "",
    product_name_normalized: normalize(p.name || ""),
    quantity: p.quantity || 1,
    unit: p.unit || "UN",
    unit_price: p.unit_price || 0,
    total_price: p.total_price || (p.quantity || 1) * (p.unit_price || 0),
  }));

  return {
    access_key: (extracted.access_key || "").replace(/\D/g, ""),
    emitter: {
      name: extracted.emitter_name || "",
      cnpj: (extracted.emitter_cnpj || "").replace(/\D/g, ""),
      address: extracted.emitter_address || "",
    },
    purchase_date: parsePurchaseDate(extracted.purchase_date),
    products,
    total_amount: extracted.total_amount || products.reduce((s: number, p: any) => s + p.total_price, 0),
    total_discount: extracted.total_discount || 0,
    payment_method: extracted.payment_method || "",
    item_count: products.length,
  };
}

async function tryFirecrawlExtract(
  url: string,
  apiKey: string,
  maxRetries = 2
): Promise<FirecrawlResult | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Firecrawl extract attempt ${attempt}/${maxRetries} for: ${url}`);
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["extract"],
          extract: { schema: FIRECRAWL_SCHEMA, prompt: FIRECRAWL_PROMPT },
          waitFor: 5000,
          timeout: attempt === 1 ? 30000 : 20000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const extracted = data.data?.extract || data.extract;
        console.log("Firecrawl extraction result:", JSON.stringify(extracted));
        const result = buildResultFromExtracted(extracted);
        if (result) {
          console.log(`Firecrawl extract successful: ${result.item_count} products`);
          return result;
        }
        console.warn("Firecrawl returned OK but no products found in extraction");
      } else {
        console.warn(`Firecrawl attempt ${attempt} failed with status: ${response.status}`);
      }
    } catch (err) {
      console.warn(`Firecrawl attempt ${attempt} error:`, err);
    }

    // Wait before retry (skip wait on last attempt)
    if (attempt < maxRetries) {
      console.log("Waiting 2s before retry...");
      await sleep(2000);
    }
  }

  return null;
}

// ---------- HTML regex parser (fallback) ----------

function parseNfceHtml(html: string): FirecrawlResult {
  // Extract access key
  const accessKeyMatch = html.match(/Chave de acesso[^<]*<[^>]*>[\s\S]*?(\d{44})/i) ||
    html.match(/(\d{44})/);
  const accessKey = accessKeyMatch ? accessKeyMatch[1] : "";

  // Emitter name
  let emitterName = "";
  const nameMatch = html.match(/<div[^>]*class="txtTopo"[^>]*>([\s\S]*?)<\/div>/i);
  if (nameMatch) emitterName = stripTags(nameMatch[1]).trim();
  if (!emitterName) {
    const nameMatch2 = html.match(/Razão Social[^:]*:\s*([^<\n]+)/i) ||
      html.match(/<div[^>]*NFCe_Emitente[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i);
    if (nameMatch2) emitterName = stripTags(nameMatch2[1]).trim();
  }

  // CNPJ
  let cnpj = "";
  const cnpjMatch = html.match(/CNPJ:\s*([\d.\/\-]+)/i) ||
    html.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) cnpj = cnpjMatch[1].replace(/[.\/-]/g, "");

  // Address
  let address = "";
  const addrMatch = html.match(/Endere[cç]o[^:]*:\s*([^<\n]+)/i);
  if (addrMatch) address = stripTags(addrMatch[1]).trim();

  // Purchase date
  let purchaseDate = new Date().toISOString();
  const dateMatch = html.match(/Emiss[aã]o:\s*([\d\/]+\s+[\d:]+)/i) ||
    html.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (dateMatch) {
    const dateStr = dateMatch[1] || `${dateMatch[1]} ${dateMatch[2]}`;
    purchaseDate = parsePurchaseDate(dateStr);
  }

  // Products - table rows
  const products: FirecrawlResult["products"] = [];

  const productBlocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const block of productBlocks) {
    const cols = block.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cols || cols.length < 4) continue;
    const texts = cols.map((c) => stripTags(c).trim());
    const nameCandidate = texts[0];
    const qtyCandidate = parseFloat(texts[1]?.replace(",", ".") || "");
    const unitPriceCandidate = parseFloat(texts[2]?.replace(",", ".") || "");
    const totalCandidate = parseFloat(texts[3]?.replace(",", ".") || "");
    if (nameCandidate && !isNaN(qtyCandidate) && !isNaN(unitPriceCandidate) && !isNaN(totalCandidate)) {
      const codeMatch = nameCandidate.match(/^\((\d+)\)\s*/);
      const code = codeMatch ? codeMatch[1] : "";
      const name = codeMatch ? nameCandidate.replace(codeMatch[0], "") : nameCandidate;
      products.push({
        product_code: code,
        product_name: name.trim(),
        product_name_normalized: normalize(name),
        quantity: qtyCandidate,
        unit: "UN",
        unit_price: unitPriceCandidate,
        total_price: totalCandidate,
      });
    }
  }

  // Span-based layout fallback
  if (products.length === 0) {
    const spanBlocks = html.match(/class="txtTit"[^>]*>([\s\S]*?)(?=class="txtTit"|id="linhaTotal"|$)/gi) || [];
    for (const block of spanBlocks) {
      const nm = block.match(/class="txtTit"[^>]*>([\s\S]*?)<\/span>/i);
      const qm = block.match(/Qtde\.?:?\s*([\d.,]+)/i);
      const um = block.match(/UN\.?:?\s*(\w+)/i);
      const upm = block.match(/Vl\.?\s*Unit\.?:?\s*R?\$?\s*([\d.,]+)/i);
      const tm = block.match(/Vl\.?\s*Total:?\s*R?\$?\s*([\d.,]+)/i);
      if (nm && qm && upm) {
        const name = stripTags(nm[1]).trim();
        const codeMatch = name.match(/^\((\d+)\)\s*/);
        const code = codeMatch ? codeMatch[1] : "";
        const cleanName = codeMatch ? name.replace(codeMatch[0], "") : name;
        products.push({
          product_code: code,
          product_name: cleanName.trim(),
          product_name_normalized: normalize(cleanName),
          quantity: parseFloat(qm[1].replace(",", ".")),
          unit: um ? um[1] : "UN",
          unit_price: parseFloat(upm[1].replace(",", ".")),
          total_price: tm
            ? parseFloat(tm[1].replace(",", "."))
            : parseFloat(qm[1].replace(",", ".")) * parseFloat(upm[1].replace(",", ".")),
        });
      }
    }
  }

  // Totals
  let totalAmount = 0;
  const totalMatch = html.match(/Valor\s*total\s*R?\$?\s*([\d.,]+)/i) ||
    html.match(/TOTAL\s*R?\$?\s*([\d.,]+)/i);
  if (totalMatch) totalAmount = parseFloat(totalMatch[1].replace(".", "").replace(",", "."));
  if (!totalAmount && products.length > 0) totalAmount = products.reduce((s, p) => s + p.total_price, 0);

  let totalDiscount = 0;
  const discountMatch = html.match(/Desconto[s]?\s*R?\$?\s*([\d.,]+)/i);
  if (discountMatch) totalDiscount = parseFloat(discountMatch[1].replace(".", "").replace(",", "."));

  let paymentMethod = "";
  const payMatch = html.match(/Forma\s*de\s*pagamento[\s\S]*?(Dinheiro|Cart[aã]o\s*de\s*[DC][eé]bito|Cart[aã]o\s*de\s*Cr[eé]dito|PIX|Outros)/i);
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

// ---------- Validation ----------

function validateParsedResult(result: FirecrawlResult, htmlLength: number): boolean {
  // No products at all
  if (result.products.length === 0) return false;

  // If HTML is large but we got very few products, likely bad parse
  if (result.products.length <= 2 && htmlLength > 5000) return false;

  // Check for garbage data: product names too short
  const garbageCount = result.products.filter(
    (p) => p.product_name.length < 3 || p.unit_price > 50000 || p.quantity > 5000
  ).length;
  if (garbageCount > result.products.length * 0.5) return false;

  return true;
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
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

    // Build URL from access key
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

    // Validate URL
    if (!url.includes("nfce") && !url.includes("nfe") && !url.includes("fazenda")) {
      try { new URL(url); } catch {
        return new Response(
          JSON.stringify({ error: "URL inválida" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Normalize domain
    url = url.replace("nfce.fazenda.mg.gov.br", "portalsped.fazenda.mg.gov.br");

    // ===== Step 1: Firecrawl extract with retry =====
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    let parsed: FirecrawlResult | null = null;

    if (firecrawlApiKey) {
      parsed = await tryFirecrawlExtract(url, firecrawlApiKey, 2);
    }

    // ===== Step 2: Fallback - Firecrawl HTML + regex =====
    let html = "";
    if (!parsed && firecrawlApiKey) {
      console.log("Firecrawl extract failed after retries, trying Firecrawl HTML fallback...");
      try {
        const fcHtmlResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url, formats: ["html"], waitFor: 5000 }),
        });
        if (fcHtmlResponse.ok) {
          const fcHtmlData = await fcHtmlResponse.json();
          html = fcHtmlData.data?.html || fcHtmlData.html || "";
        } else {
          console.warn("Firecrawl HTML fallback failed with status:", fcHtmlResponse.status);
        }
      } catch (e) {
        console.warn("Firecrawl HTML fallback error:", e);
      }
    }

    // ===== Step 3: Native fetch fallback =====
    if (!parsed && !html) {
      console.log("Using native fetch for:", url);
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/91.0.4472.120 Mobile Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
          },
          redirect: "follow",
        });
        if (!response.ok) {
          if (response.status === 404) {
            return new Response(
              JSON.stringify({ error: "Cupom fiscal não encontrado" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: `Erro ao acessar o portal: ${response.status}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        html = await response.text();
      } catch (fetchError) {
        console.error("Native fetch failed:", fetchError);
        return new Response(
          JSON.stringify({ error: "Não foi possível acessar o portal da SEFAZ. Tente novamente em alguns instantes." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ===== Parse HTML if we have it =====
    if (!parsed && html) {
      const regexResult = parseNfceHtml(html);
      if (validateParsedResult(regexResult, html.length)) {
        parsed = regexResult;
        console.log(`HTML regex parse successful: ${parsed.item_count} products`);
      } else {
        console.warn(`HTML regex parse produced invalid data: ${regexResult.item_count} products from ${html.length} chars of HTML`);
      }
    }

    // ===== Final validation =====
    if (!parsed || parsed.products.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Não foi possível extrair os produtos do cupom fiscal. O portal pode estar lento. Tente novamente em alguns instantes.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fill missing access key
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
    console.error("fetch-nfce error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar o cupom" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
