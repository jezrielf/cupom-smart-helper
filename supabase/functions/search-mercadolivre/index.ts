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
  'limp': 'limpador', 'enxag': 'enxaguante',
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
  console.log(`ML search: "${name}" → "${query}" (volume: ${volume})`);
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
  // Extract the FIRST valid BRL price (not the minimum of all)
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
  // ML product pages contain /p/MLB
  return /\/p\/ML[A-Z]/.test(url);
}

function isListingPage(url: string): boolean {
  return url.includes('/s?') || url.includes('#searchVariation') || url.includes('/ofertas');
}

interface MLProduct {
  title: string;
  price: number;
  url: string;
  volume?: string;
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
    // Don't use site: operator - filter by domain in code instead
    const searchQuery = `${query} mercado livre`;

    console.log('Firecrawl search query:', searchQuery);

    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 8,
        lang: 'pt-br',
        country: 'br',
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      }),
    });

    const searchData = await searchResponse.json();
    console.log('Firecrawl response status:', searchResponse.status);

    if (!searchResponse.ok) {
      console.error('Firecrawl error:', JSON.stringify(searchData));
      return new Response(
        JSON.stringify({ success: false, error: searchData.error || 'Search failed' }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchResults = searchData?.data || [];
    console.log(`Search returned ${searchResults.length} results`);

    // Log all URLs for debugging
    for (const r of searchResults) {
      console.log(`  URL: ${(r.url || '').substring(0, 100)}`);
    }

    const results: MLProduct[] = [];

    for (const result of searchResults) {
      const url = result.url || '';
      const title = result.title || result.metadata?.title || '';
      const markdown = result.markdown || '';

      // Accept mercadolivre.com.br OR mercadolibre.com URLs
      const isML = url.includes('mercadolivre.com.br') || url.includes('mercadolibre.com');
      if (!isML || !title) {
        console.log(`Skipped (not ML): ${url.substring(0, 80)}`);
        continue;
      }

      // Skip listing/search pages
      if (isListingPage(url)) {
        console.log(`Skipped (listing page): ${url.substring(0, 80)}`);
        continue;
      }

      const price = extractFirstPrice(markdown);
      if (price && price > 0) {
        const resultVolume = parseVolume(title) || undefined;
        results.push({
          title: title.substring(0, 200),
          price,
          url, // Direct product URL
          volume: resultVolume,
        });
        console.log(`Found: "${title.substring(0, 60)}" → R$${price} (${isProductPage(url) ? 'product' : 'other'}) → ${url.substring(0, 80)}`);
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

    // Sort: product pages first, then by price
    filteredResults.sort((a, b) => {
      const aProduct = isProductPage(a.url) ? 0 : 1;
      const bProduct = isProductPage(b.url) ? 0 : 1;
      if (aProduct !== bProduct) return aProduct - bProduct;
      return a.price - b.price;
    });

    const finalResults = filteredResults.slice(0, 5);
    const searchUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`;
    console.log(`Found ${finalResults.length} ML results for "${product_name}"`);

    return new Response(
      JSON.stringify({ success: true, results: finalResults, search_url: searchUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in search-mercadolivre:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
