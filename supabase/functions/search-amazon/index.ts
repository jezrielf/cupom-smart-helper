const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ABBREVIATION_MAP: Record<string, string> = {
  'mac': 'macarrao', 'cr': 'creme', 'tom': 'tomate', 'espag': 'espaguete',
  'sta': 'santa', 'abs': 'absorvente', 'ext': 'extrato', 'liq': 'liquido',
  'desod': 'desodorante', 'sab': 'sabonete', 'det': 'detergente', 'deterg': 'detergente',
  'amac': 'amaciante', 'cond': 'condicionador', 'shamp': 'shampoo',
  'bisc': 'biscoito', 'choc': 'chocolate', 'marg': 'margarina',
  'refrig': 'refrigerante', 'integ': 'integral', 'trad': 'tradicional',
  'antissep': 'antisseptico', 'antissept': 'antisseptico',
  'hig': 'higienico', 'alc': 'alcool', 'desinf': 'desinfetante',
  'apar': 'aparelho', 'mist': 'mistura', 'past': 'pastilha',
  'tint': 'tintura', 'esc': 'escova', 'org': 'organico',
  'desc': 'descartavel', 'acond': 'acondicionador', 'deseng': 'desengraxante',
  'multiuso': 'multiuso', 'limp': 'limpador', 'enxag': 'enxaguante',
  'la': 'la de', 'aco': 'aco',
};

const PACKAGING_CODES = /\b(pc|pt|gl|fr|sc|tp|gr|cx|fd|bd|lt|un|dp|tb|env|fl|sq|pct|gar|sac)\b/g;
const WEIGHT_VOLUME = /\b(\d+([.,]\d+)?)\s*(g|kg|ml|l)\b/gi;

function normalizeForSearch(name: string): { query: string; volume: string | null } {
  let normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const volRegex = /\b(\d+([.,]\d+)?)\s*(g|kg|ml|l)\b/gi;
  const volumeMatches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = volRegex.exec(normalized)) !== null) {
    const qty = match[1].replace(',', '.');
    const unit = match[3].toLowerCase();
    volumeMatches.push(`${qty}${unit}`);
  }
  const volume = volumeMatches.length > 0 ? volumeMatches[0] : null;

  normalized = normalized.replace(WEIGHT_VOLUME, ' ');
  normalized = normalized.replace(PACKAGING_CODES, ' ');
  normalized = normalized.replace(/\b([a-z]+)\b/g, (m) => ABBREVIATION_MAP[m] || m);
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  normalized = normalized.trim().replace(/\s+/g, ' ');

  const query = volume ? `${normalized} ${volume}` : normalized;
  console.log(`Amazon search: "${name}" → "${query}" (volume: ${volume})`);
  return { query, volume };
}

function parseVolume(text: string): string | null {
  const m = text.match(/(\d+([.,]\d+)?)\s*(g|kg|ml|l)\b/i);
  if (!m) return null;
  const qty = parseFloat(m[1].replace(',', '.'));
  const unit = m[3].toLowerCase();
  if (unit === 'l') return `${qty * 1000}ml`;
  if (unit === 'kg') return `${qty * 1000}g`;
  return `${qty}${unit}`;
}

function isVolumeCompatible(resultText: string | null, targetVolume: string | null): boolean {
  if (!targetVolume || !resultText) return true;
  const target = parseVolume(targetVolume);
  const result = parseVolume(resultText);
  if (!target || !result) return true;
  const targetUnit = target.replace(/[\d.]/g, '');
  const resultUnit = result.replace(/[\d.]/g, '');
  if (targetUnit !== resultUnit) return true;
  const targetQty = parseFloat(target.replace(/[a-z]/gi, ''));
  const resultQty = parseFloat(result.replace(/[a-z]/gi, ''));
  if (isNaN(targetQty) || isNaN(resultQty)) return true;
  const ratio = resultQty / targetQty;
  return ratio >= 0.8 && ratio <= 1.2;
}

function extractFirstPrice(markdown: string): number | null {
  const pattern = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(markdown)) !== null) {
    const priceStr = m[1].replace(/\./g, '').replace(',', '.');
    const price = parseFloat(priceStr);
    if (!isNaN(price) && price > 1 && price < 10000) {
      return price;
    }
  }
  return null;
}

function isProductPage(url: string): boolean {
  return url.includes('/dp/') || url.includes('/gp/product/');
}

// Detect multi-pack quantity from title text via regex fallback
function detectPackQuantity(title: string): number {
  const lower = title.toLowerCase();
  const patterns = [
    /(\d+)\s*x\s*\d/i,                          // "20x45g" or "8 x 500ml"
    /c\/?o?m?\s*(\d+)\s*(unid|un\b|und|pct|pacote|sach)/i,  // "com 20 unidades", "c/ 8 un"
    /(\d+)\s*(unid|unidades)\b/i,                // "20 unidades"
    /pack\s*(?:com|c\/)?\s*(\d+)/i,              // "pack com 12"
    /fardo\s*(?:com|c\/)?\s*(\d+)/i,             // "fardo com 20"
    /caixa\s*(?:com|c\/)?\s*(\d+)/i,             // "caixa com 14"
    /kit\s*(?:com|c\/)?\s*(\d+)/i,               // "kit com 6"
    /(\d+)\s*(?:rolos|pares|sachets|saches|latas|garrafas|pacotes)\b/i,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m) {
      const qty = parseInt(m[1], 10);
      if (qty > 1 && qty <= 200) {
        console.log(`  Pack detected via regex: ${qty} units in "${title.substring(0, 60)}"`);
        return qty;
      }
    }
  }
  return 1;
}

interface AmazonProduct {
  title: string;
  price: number;
  url: string;
  volume?: string;
}

async function scrapeProductPrice(apiKey: string, url: string): Promise<{ title: string; price: number; units: number } | null> {
  try {
    console.log(`Scraping Amazon product: ${url.substring(0, 80)}`);
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['extract'],
        extract: {
          schema: {
            type: 'object',
            properties: {
              titulo: { type: 'string', description: 'Título completo do produto' },
              preco_atual: { type: 'number', description: 'Preço de venda atual em reais (número decimal, ex: 29.90). NÃO incluir preço de frete, parcela ou preço de outros vendedores. Apenas o preço principal do produto.' },
              quantidade_unidades: { type: 'number', description: 'Quantidade de unidades individuais contidas no produto. Se for um fardo/pack/caixa com múltiplas unidades (ex: "Pack com 20 unidades", "Caixa 14 pacotes", "Kit 8 unidades"), retorne a quantidade total de unidades individuais. Se for venda unitária (1 item apenas), retorne 1.' },
              disponivel: { type: 'boolean', description: 'Se o produto está disponível para compra' },
            },
            required: ['titulo', 'preco_atual', 'quantidade_unidades'],
          },
          prompt: 'Extraia o título completo do produto, o preço PRINCIPAL de venda atual em reais (R$), e a QUANTIDADE DE UNIDADES individuais contidas. IMPORTANTE: Muitos produtos são vendidos em fardos, packs, caixas ou kits com múltiplas unidades. Verifique se o título ou descrição menciona "pack", "fardo", "caixa", "kit", "com X unidades", "X pacotes", etc. Se sim, retorne a quantidade total de unidades individuais no campo quantidade_unidades. Se for venda unitária (apenas 1 item), retorne 1. O preço deve ser o valor à vista, NÃO frete ou parcela.',
        },
        onlyMainContent: true,
        timeout: 15000,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Scrape error:', response.status, JSON.stringify(data).substring(0, 200));
      return null;
    }

    const extracted = data?.data?.extract || data?.extract;
    if (extracted?.preco_atual && extracted.preco_atual > 1) {
      const scrapedUnits = extracted.quantidade_unidades && extracted.quantidade_unidades > 1 ? extracted.quantidade_unidades : 1;
      // Also check title with regex as fallback
      const regexUnits = detectPackQuantity(extracted.titulo || '');
      const units = Math.max(scrapedUnits, regexUnits);
      
      console.log(`Scraped: R$${extracted.preco_atual} × ${units} units — "${(extracted.titulo || '').substring(0, 60)}"`);
      return { title: extracted.titulo || '', price: extracted.preco_atual, units };
    }
    console.log('Scrape returned no valid price');
    return null;
  } catch (err) {
    console.error('Scrape exception:', err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { product_name } = await req.json();

    if (!product_name || typeof product_name !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'product_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query, volume } = normalizeForSearch(product_name);
    const searchQuery = `${query} amazon.com.br`;

    console.log('Firecrawl search query:', searchQuery);

    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 5,
        lang: 'pt-br',
        country: 'br',
      }),
    });

    const searchData = await searchResponse.json();
    console.log('Search response status:', searchResponse.status);

    if (!searchResponse.ok) {
      console.error('Search error:', JSON.stringify(searchData));
      return new Response(
        JSON.stringify({ success: false, error: searchData.error || 'Search failed' }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchResults = searchData?.data || [];
    console.log(`Search returned ${searchResults.length} results`);

    const productUrls = searchResults.filter((r: any) => {
      const url = r.url || '';
      const isAmazon = url.includes('amazon.com.br');
      const isProduct = isProductPage(url);
      const isListing = url.includes('/s?') || url.includes('/s/') || url.includes('/b/') || url.includes('/slp/');
      if (!isAmazon) console.log(`  Skipped (not amazon): ${url.substring(0, 80)}`);
      else if (isListing) console.log(`  Skipped (listing): ${url.substring(0, 80)}`);
      else if (!isProduct) console.log(`  Non-product URL: ${url.substring(0, 80)}`);
      else console.log(`  ✓ Product URL: ${url.substring(0, 80)}`);
      return isAmazon && isProduct && !isListing;
    });

    console.log(`Found ${productUrls.length} product URLs`);

    const results: AmazonProduct[] = [];
    const urlsToScrape = productUrls.slice(0, 3);

    for (const result of urlsToScrape) {
      const url = result.url;
      const scraped = await scrapeProductPrice(apiKey, url);

      if (scraped) {
        const unitPrice = scraped.units > 1 ? scraped.price / scraped.units : scraped.price;
        const titleSuffix = scraped.units > 1 ? ` (preço por unidade — pack c/ ${scraped.units})` : '';
        const resultVolume = parseVolume(scraped.title) || undefined;
        
        console.log(`  Final unit price: R$${unitPrice.toFixed(2)} (${scraped.units} units)`);
        results.push({
          title: scraped.title.substring(0, 200) + titleSuffix,
          price: Math.round(unitPrice * 100) / 100,
          url,
          volume: resultVolume,
        });
      } else {
        const markdown = result.markdown || '';
        const fallbackPrice = extractFirstPrice(markdown);
        if (fallbackPrice) {
          const title = result.title || result.metadata?.title || '';
          const units = detectPackQuantity(title);
          const unitPrice = units > 1 ? fallbackPrice / units : fallbackPrice;
          const titleSuffix = units > 1 ? ` (preço por unidade — pack c/ ${units})` : '';
          
          results.push({
            title: title.substring(0, 200) + titleSuffix,
            price: Math.round(unitPrice * 100) / 100,
            url,
            volume: parseVolume(title) || undefined,
          });
          console.log(`Fallback price for ${url.substring(0, 60)}: R$${fallbackPrice} / ${units} = R$${unitPrice.toFixed(2)}`);
        }
      }
    }

    // Fallback: non-product Amazon URLs
    if (results.length === 0) {
      for (const result of searchResults) {
        const url = result.url || '';
        if (!url.includes('amazon.com.br') || isProductPage(url)) continue;
        if (url.includes('/s?') || url.includes('/s/') || url.includes('/b/')) continue;
        const markdown = result.markdown || '';
        const price = extractFirstPrice(markdown);
        if (price) {
          const title = result.title || '';
          const units = detectPackQuantity(title);
          const unitPrice = units > 1 ? price / units : price;
          const titleSuffix = units > 1 ? ` (preço por unidade — pack c/ ${units})` : '';
          results.push({ title: title.substring(0, 200) + titleSuffix, price: Math.round(unitPrice * 100) / 100, url, volume: parseVolume(title) || undefined });
          console.log(`Fallback non-product: "${title.substring(0, 50)}" R$${price} / ${units} = R$${unitPrice.toFixed(2)}`);
          if (results.length >= 3) break;
        }
      }
    }

    let filteredResults = results;
    if (volume && results.length > 0) {
      const compatible = results.filter(r => isVolumeCompatible(r.volume || r.title, volume));
      if (compatible.length > 0) {
        filteredResults = compatible;
        console.log(`Volume filter: ${compatible.length}/${results.length} compatible with ${volume}`);
      }
    }

    filteredResults.sort((a, b) => a.price - b.price);

    const finalResults = filteredResults.slice(0, 5);
    const searchUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`;
    console.log(`Found ${finalResults.length} Amazon results for "${product_name}"`);

    return new Response(
      JSON.stringify({ success: true, results: finalResults, search_url: searchUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in search-amazon:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
