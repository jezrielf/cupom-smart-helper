const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ABBREVIATION_MAP: Record<string, string> = {
  'mac': 'macarrao',
  'cr': 'creme',
  'tom': 'tomate',
  'espag': 'espaguete',
  'sta': 'santa',
  'abs': 'absorvente',
  'ext': 'extrato',
  'liq': 'liquido',
  'desod': 'desodorante',
  'sab': 'sabonete',
  'det': 'detergente',
  'amac': 'amaciante',
  'cond': 'condicionador',
  'shamp': 'shampoo',
  'bisc': 'biscoito',
  'choc': 'chocolate',
  'marg': 'margarina',
  'refrig': 'refrigerante',
  'integ': 'integral',
  'trad': 'tradicional',
  'antissep': 'antisseptico',
  'hig': 'higienico',
  'alc': 'alcool',
  'desinf': 'desinfetante',
  'apar': 'aparelho',
  'mist': 'mistura',
  'past': 'pastilha',
  'tint': 'tintura',
  'esc': 'escova',
  'org': 'organico',
  'desc': 'descartavel',
  'acond': 'acondicionador',
  'deseng': 'desengraxante',
  'multiuso': 'multiuso',
  'limp': 'limpador',
  'enxag': 'enxaguante',
};

const PACKAGING_CODES = /\b(pc|pt|gl|fr|sc|tp|gr|cx|fd|bd|lt|un|dp|tb|env|fl|sq|pct|gar|sac)\b/g;
const WEIGHT_VOLUME = /\b(\d+([.,]\d+)?)\s*(g|kg|ml|l)\b/gi;
const SIZE_CODES = /\b[a-z]?\d{1,2}\b/g;

function normalizeForSearch(name: string): { query: string; volume: string | null } {
  let normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Extract volume/weight
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
  normalized = normalized.replace(SIZE_CODES, ' ');
  normalized = normalized.replace(/\b([a-z]+)\b/g, (m) => ABBREVIATION_MAP[m] || m);
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  normalized = normalized.trim().replace(/\s+/g, ' ');

  // Build search query with volume
  const query = volume ? `${normalized} ${volume}` : normalized;
  console.log(`Amazon search query: "${name}" → "${query}" (volume: ${volume})`);
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

interface AmazonProduct {
  title: string;
  price: number;
  url: string;
  volume?: string;
}

function extractPriceFromMarkdown(markdown: string): number | null {
  // Look for BRL prices in the scraped product page
  const pricePatterns = [
    /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g,
    /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:à vista|no pix)/gi,
  ];

  const prices: number[] = [];
  for (const pattern of pricePatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(markdown)) !== null) {
      const priceStr = m[1].replace(/\./g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0 && price < 10000) {
        prices.push(price);
      }
    }
  }

  // Return the lowest reasonable price found
  if (prices.length === 0) return null;
  return Math.min(...prices);
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
    const searchQuery = `${query} site:amazon.com.br`;

    console.log('Firecrawl search query:', searchQuery);

    // Step 1: Use Firecrawl Search API to find real product pages
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
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      }),
    });

    const searchData = await searchResponse.json();
    console.log('Firecrawl search response status:', searchResponse.status);

    if (!searchResponse.ok) {
      console.error('Firecrawl search error:', JSON.stringify(searchData));
      return new Response(
        JSON.stringify({ success: false, error: searchData.error || 'Search failed' }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchResults = searchData?.data || [];
    console.log(`Search returned ${searchResults.length} results`);

    const results: AmazonProduct[] = [];

    for (const result of searchResults) {
      const url = result.url || '';
      const title = result.title || result.metadata?.title || '';
      const markdown = result.markdown || '';

      // Skip non-product pages
      if (!url.includes('amazon.com.br') || !title) continue;
      // Prefer /dp/ product pages over search/listing pages
      const isProductPage = url.includes('/dp/') || url.includes('/gp/product/');

      // Extract price from the scraped markdown content
      let price = extractPriceFromMarkdown(markdown);

      // If price found from markdown of product page, use it
      if (price && price > 0) {
        const resultVolume = parseVolume(title) || undefined;
        results.push({
          title: title.substring(0, 200),
          price,
          url,
          volume: resultVolume,
        });
        console.log(`Found: "${title.substring(0, 60)}" → R$${price} (${isProductPage ? 'product' : 'other'} page)`);
      }
    }

    // Filter by volume compatibility
    let filteredResults = results;
    if (volume && results.length > 0) {
      const compatible = results.filter(r => isVolumeCompatible(r.volume || r.title, volume));
      if (compatible.length > 0) {
        filteredResults = compatible;
        console.log(`Volume filter: ${compatible.length}/${results.length} compatible with ${volume}`);
      }
    }

    // Sort by price ascending and take top 5
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
