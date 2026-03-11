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
};

// Packaging/unit codes to remove
const PACKAGING_CODES = /\b(pc|pt|gl|fr|sc|tp|gr|cx|fd|bd|lt|un|dp|tb|env|fl|sq|pct|gar|sac)\b/g;

// Weight/volume patterns like 500G, 1KG, 900ML, 200G, 1L, 1.5L
const WEIGHT_VOLUME = /\b\d+([.,]\d+)?\s*(g|kg|ml|l|un|cm|mm)\b/g;

// Size/variant codes like T1, N8, LT1, N5
const SIZE_CODES = /\b[a-z]?\d{1,2}\b/g;

function normalizeForSearch(name: string): string {
  let normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Remove weight/volume first (before other patterns consume digits)
  normalized = normalized.replace(WEIGHT_VOLUME, ' ');

  // Remove packaging codes
  normalized = normalized.replace(PACKAGING_CODES, ' ');

  // Remove size codes (single letter + 1-2 digits)
  normalized = normalized.replace(SIZE_CODES, ' ');

  // Expand abbreviations
  normalized = normalized.replace(/\b([a-z]+)\b/g, (match) => {
    return ABBREVIATION_MAP[match] || match;
  });

  // Remove non-alphanumeric
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');

  // Collapse whitespace and convert to hyphens
  normalized = normalized.trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  return normalized;
}

interface MLProduct {
  title: string;
  price: number;
  url: string;
}

function parseMarkdownResults(markdown: string): MLProduct[] {
  const results: MLProduct[] = [];
  const lines = markdown.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    // Pattern 1: ML links [Title](url)
    const titleMatch = line.match(/\[([^\]]{5,})\]\((https?:\/\/[^\s)]*mercadolivre[^\s)]+)\)/);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      const url = titleMatch[2];

      const price = findPriceNearby(lines, li);
      if (price > 0) {
        results.push({ title, price, url });
      }
    }

    // Pattern 2: Bold titles **Title** or ### Title without links
    if (results.length < 5 && !titleMatch) {
      const boldMatch = line.match(/^(?:\*\*|###?\s)(.{10,})(?:\*\*)?$/);
      if (boldMatch) {
        const title = boldMatch[1].replace(/\*\*/g, '').trim();
        const price = findPriceNearby(lines, li);
        if (price > 0) {
          let url = '';
          for (let j = Math.max(0, li - 3); j < Math.min(li + 5, lines.length); j++) {
            const urlMatch = lines[j].match(/\((https?:\/\/[^\s)]*mercadolivre[^\s)]+)\)/);
            if (urlMatch) { url = urlMatch[1]; break; }
          }
          results.push({ title, price, url });
        }
      }
    }

    if (results.length >= 5) break;
  }

  return results;
}

function findPriceNearby(lines: string[], idx: number): number {
  const priceRegex = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;

  for (let j = idx; j < Math.min(idx + 8, lines.length); j++) {
    const priceMatch = lines[j].match(priceRegex);
    if (priceMatch) {
      const priceStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0 && price < 10000) {
        return price;
      }
    }
  }

  return 0;
}

async function scrapeUrl(apiKey: string, url: string): Promise<{ results: MLProduct[]; searchUrl: string }> {
  let results: MLProduct[] = [];

  // Try extract format first
  try {
    const extractResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
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
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Product title' },
                    price: { type: 'number', description: 'Product price in BRL as a number (e.g. 24.50)' },
                    url: { type: 'string', description: 'Product URL on Mercado Livre' },
                  },
                  required: ['title', 'price'],
                },
              },
            },
            required: ['products'],
          },
          prompt: 'Extract the first 5 product results with their title, price in BRL as a number, and product URL. Only include items with a valid price.',
        },
        waitFor: 5000,
      }),
    });

    const extractData = await extractResponse.json();
    console.log('Firecrawl extract response status:', extractResponse.status);

    if (!extractResponse.ok) {
      console.error('Firecrawl extract error body:', JSON.stringify(extractData));
    }

    const extracted = extractData?.data?.extract || extractData?.extract;
    if (extracted?.products && Array.isArray(extracted.products)) {
      results = extracted.products
        .filter((p: any) => p.title && typeof p.price === 'number' && p.price > 0)
        .slice(0, 5)
        .map((p: any) => ({
          title: p.title,
          price: p.price,
          url: p.url || url,
        }));
    }
  } catch (e) {
    console.error('Extract failed, trying markdown fallback:', e);
  }

  // Fallback: markdown extraction
  if (results.length === 0) {
    try {
      const mdResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          waitFor: 5000,
        }),
      });

      const mdData = await mdResponse.json();
      const markdown = mdData?.data?.markdown || mdData?.markdown || '';

      if (markdown) {
        results = parseMarkdownResults(markdown);
      }
    } catch (e) {
      console.error('Markdown fallback also failed:', e);
    }
  }

  return { results, searchUrl: url };
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

    const normalized = normalizeForSearch(product_name);
    console.log(`Normalized "${product_name}" → "${normalized}"`);

    // Try supermarket-specific URL first
    const mlUrl = `https://lista.mercadolivre.com.br/supermercado/market/${normalized}_OrderId_PRICE_NoIndex_True?sb=storefront_url`;
    console.log('Scraping Mercado Livre URL:', mlUrl);

    let { results, searchUrl } = await scrapeUrl(apiKey, mlUrl);

    // Fallback: broader search if supermarket URL returned 0 results
    if (results.length === 0) {
      const broadUrl = `https://lista.mercadolivre.com.br/${normalized}_OrderId_PRICE_NoIndex_True`;
      console.log('Supermarket URL returned 0 results, trying broad URL:', broadUrl);
      const broad = await scrapeUrl(apiKey, broadUrl);
      results = broad.results;
      searchUrl = broad.searchUrl;
    }

    console.log(`Found ${results.length} ML results for "${product_name}"`);

    return new Response(
      JSON.stringify({ success: true, results, search_url: searchUrl }),
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
