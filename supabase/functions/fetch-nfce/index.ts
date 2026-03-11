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

function extractBetween(html: string, startMarker: string, endMarker: string): string {
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return "";
  const afterStart = startIdx + startMarker.length;
  const endIdx = html.indexOf(endMarker, afterStart);
  if (endIdx === -1) return "";
  return html.substring(afterStart, endIdx).trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function parseNfceHtml(html: string) {
  // Extract access key
  const accessKeyMatch = html.match(/Chave de acesso[^<]*<[^>]*>[\s\S]*?(\d{44})/i) ||
    html.match(/(\d{44})/);
  const accessKey = accessKeyMatch ? accessKeyMatch[1] : "";

  // Extract emitter (supermarket) info
  const emitterSection = extractBetween(html, "id=\"u20\"", "</div>") ||
    extractBetween(html, "NFCe_Emitente", "</div>");
  
  let emitterName = "";
  let cnpj = "";
  let address = "";

  // Try to find CNPJ
  const cnpjMatch = html.match(/CNPJ:\s*([\d.\/\-]+)/i) ||
    html.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) {
    cnpj = cnpjMatch[1].replace(/[.\/-]/g, "");
  }

  // Try to find emitter name from various patterns
  const nameMatch = html.match(/<div[^>]*class="txtTopo"[^>]*>([\s\S]*?)<\/div>/i);
  if (nameMatch) {
    emitterName = stripTags(nameMatch[1]).trim();
  }
  if (!emitterName) {
    const nameMatch2 = html.match(/Razão Social[^:]*:\s*([^<\n]+)/i) ||
      html.match(/<div[^>]*NFCe_Emitente[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i);
    if (nameMatch2) emitterName = stripTags(nameMatch2[1]).trim();
  }

  // Extract address
  const addrMatch = html.match(/Endere[cç]o[^:]*:\s*([^<\n]+)/i) ||
    html.match(/<div[^>]*txtTopo[^>]*>[\s\S]*?<div[^>]*txtTopo[^>]*>([\s\S]*?)<\/div>/i);
  if (addrMatch) address = stripTags(addrMatch[1]).trim();

  // Extract purchase date
  let purchaseDate = new Date().toISOString();
  const dateMatch = html.match(/Emiss[aã]o:\s*([\d\/]+\s+[\d:]+)/i) ||
    html.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (dateMatch) {
    const dateStr = dateMatch[1] || `${dateMatch[1]} ${dateMatch[2]}`;
    const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
    if (parts) {
      purchaseDate = new Date(
        parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]),
        parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6] || "0")
      ).toISOString();
    }
  }

  // Extract products - look for table rows
  const products: Array<{
    product_code: string;
    product_name: string;
    product_name_normalized: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }> = [];

  // Pattern 1: Table-based layout (common in SEFAZ MG)
  const productBlocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const block of productBlocks) {
    const cols = block.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cols || cols.length < 4) continue;
    
    const texts = cols.map((c) => stripTags(c).trim());
    // Try to identify product rows (has numeric values)
    const nameCandidate = texts[0];
    const qtyCandidate = parseFloat(texts[1]?.replace(",", ".") || "");
    const unitPriceCandidate = parseFloat(texts[2]?.replace(",", ".") || "");
    const totalCandidate = parseFloat(texts[3]?.replace(",", ".") || "");

    if (nameCandidate && !isNaN(qtyCandidate) && !isNaN(unitPriceCandidate) && !isNaN(totalCandidate)) {
      // Extract product code if present
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

  // Pattern 2: Span-based layout (alternate SEFAZ format)
  if (products.length === 0) {
    const spanBlocks = html.match(/class="txtTit"[^>]*>([\s\S]*?)(?=class="txtTit"|id="linhaTotal"|$)/gi) || [];
    for (const block of spanBlocks) {
      const nameMatch = block.match(/class="txtTit"[^>]*>([\s\S]*?)<\/span>/i);
      const qtyMatch = block.match(/Qtde\.?:?\s*([\d.,]+)/i);
      const unitMatch = block.match(/UN\.?:?\s*(\w+)/i);
      const unitPriceMatch = block.match(/Vl\.?\s*Unit\.?:?\s*R?\$?\s*([\d.,]+)/i);
      const totalMatch = block.match(/Vl\.?\s*Total:?\s*R?\$?\s*([\d.,]+)/i);

      if (nameMatch && qtyMatch && unitPriceMatch) {
        const name = stripTags(nameMatch[1]).trim();
        const codeMatch = name.match(/^\((\d+)\)\s*/);
        const code = codeMatch ? codeMatch[1] : "";
        const cleanName = codeMatch ? name.replace(codeMatch[0], "") : name;

        products.push({
          product_code: code,
          product_name: cleanName.trim(),
          product_name_normalized: normalize(cleanName),
          quantity: parseFloat(qtyMatch[1].replace(",", ".")),
          unit: unitMatch ? unitMatch[1] : "UN",
          unit_price: parseFloat(unitPriceMatch[1].replace(",", ".")),
          total_price: totalMatch
            ? parseFloat(totalMatch[1].replace(",", "."))
            : parseFloat(qtyMatch[1].replace(",", ".")) *
              parseFloat(unitPriceMatch[1].replace(",", ".")),
        });
      }
    }
  }

  // Extract totals
  let totalAmount = 0;
  const totalMatch = html.match(/Valor\s*total\s*R?\$?\s*([\d.,]+)/i) ||
    html.match(/TOTAL\s*R?\$?\s*([\d.,]+)/i);
  if (totalMatch) {
    totalAmount = parseFloat(totalMatch[1].replace(".", "").replace(",", "."));
  }
  if (!totalAmount && products.length > 0) {
    totalAmount = products.reduce((sum, p) => sum + p.total_price, 0);
  }

  let totalDiscount = 0;
  const discountMatch = html.match(/Desconto[s]?\s*R?\$?\s*([\d.,]+)/i);
  if (discountMatch) {
    totalDiscount = parseFloat(discountMatch[1].replace(".", "").replace(",", "."));
  }

  // Payment method
  let paymentMethod = "";
  const payMatch = html.match(/Forma\s*de\s*pagamento[\s\S]*?(Dinheiro|Cart[aã]o\s*de\s*[DC][eé]bito|Cart[aã]o\s*de\s*Cr[eé]dito|PIX|Outros)/i);
  if (payMatch) paymentMethod = payMatch[1];

  return {
    access_key: accessKey,
    emitter: {
      name: emitterName,
      cnpj,
      address,
    },
    purchase_date: purchaseDate,
    products,
    total_amount: totalAmount,
    total_discount: totalDiscount,
    payment_method: paymentMethod,
    item_count: products.length,
  };
}

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

    // Build URL from access key if needed
    if (!url && accessKey) {
      const cleanKey = accessKey.replace(/\s/g, "");
      if (cleanKey.length !== 44 || !/^\d+$/.test(cleanKey)) {
        return new Response(
          JSON.stringify({ error: "Chave de acesso inválida. Deve conter 44 dígitos." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      url = `https://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${cleanKey}`;
    }

    // Validate URL
    if (!url.includes("nfce") && !url.includes("nfe") && !url.includes("fazenda")) {
      // Try treating as a generic URL
      try {
        new URL(url);
      } catch {
        return new Response(
          JSON.stringify({ error: "URL inválida" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch the NFC-e page
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/91.0.4472.120 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
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

    const html = await response.text();

    // Parse the HTML
    const parsed = parseNfceHtml(html);

    if (!parsed.access_key && accessKey) {
      parsed.access_key = accessKey.replace(/\s/g, "");
    }

    // Extract access key from URL if still missing
    if (!parsed.access_key && url) {
      const urlKeyMatch = url.match(/p=(\d{44})/);
      if (urlKeyMatch) parsed.access_key = urlKeyMatch[1];
    }

    return new Response(
      JSON.stringify({ ...parsed, qr_code_url: url, raw_html: html }),
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
