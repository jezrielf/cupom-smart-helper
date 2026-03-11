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

interface NormalizeResult {
  searchTerms: string;
  volume: string | null;
}

function normalizeForSearch(name: string): NormalizeResult {
  let normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Extract volume/weight BEFORE removing it
  const volumeMatches: string[] = [];
  let match: RegExpExecArray | null;
  const volRegex = /\b(\d+([.,]\d+)?)\s*(g|kg|ml|l)\b/gi;
  while ((match = volRegex.exec(normalized)) !== null) {
    const qty = match[1].replace(',', '.');
    const unit = match[3].toLowerCase();
    volumeMatches.push(`${qty}${unit}`);
  }
  const volume = volumeMatches.length > 0 ? volumeMatches[0] : null;

  // Remove weight/volume from text
  normalized = normalized.replace(WEIGHT_VOLUME, ' ');
  normalized = normalized.replace(PACKAGING_CODES, ' ');
  normalized = normalized.replace(SIZE_CODES, ' ');

  normalized = normalized.replace(/\b([a-z]+)\b/g, (m) => ABBREVIATION_MAP[m] || m);
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  normalized = normalized.trim().replace(/\s+/g, '+');

  // Append volume back to search
  if (volume) {
    normalized = `${normalized}+${volume}`;
  }

  console.log(`Amazon normalized: "${name}" → "${normalized}" (volume: ${volume})`);
  return { searchTerms: normalized, volume };
}

function parseVolume(text: string): string | null {
  const m = text.match(/(\d+([.,]\d+)?)\s*(g|kg|ml|l)\b/i);
  if (!m) return null;
  const qty = parseFloat(m[1].replace(',', '.'));
  const unit = m[3].toLowerCase();
  // Normalize to base unit (ml or g)
  if (unit === 'l') return `${qty * 1000}ml`;
  if (unit === 'kg') return `${qty * 1000}g`;
  return `${qty}${unit}`;
}

function isVolumeCompatible(resultVolume: string | null, targetVolume: string | null): boolean {
  if (!targetVolume || !resultVolume) return true; // can't compare, allow
  const target = parseVolume(targetVolume);
  const result = parseVolume(resultVolume);
  if (!target || !result) return true;

  const targetUnit = target.replace(/[\d.]/g, '');
  const resultUnit = result.replace(/[\d.]/g, '');
  if (targetUnit !== resultUnit) return true; // different units, can't compare

  const targetQty = parseFloat(target.replace(/[a-z]/gi, ''));
  const resultQty = parseFloat(result.replace(/[a-z]/gi, ''));
  if (isNaN(targetQty) || isNaN(resultQty)) return true;

  // Allow within 20% tolerance
  const ratio = resultQty / targetQty;
  return ratio >= 0.8 && ratio <= 1.2;
}

interface AmazonProduct {
  title: string;
  price: number;
  url: string;
  volume?: string;
}

function parseMarkdownResults(markdown: string, targetVolume: string | null): AmazonProduct[] {
  const results: AmazonProduct[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const titleMatch = line.match(/\[([^\]]{10,})\]\((https:\/\/www\.amazon\.com\.br\/[^\s)]+)\)/);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      const url = titleMatch[2];
      const resultVolume = parseVolume(title);

      const priceRegex = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
      const idx = lines.indexOf(line);
      for (let i = idx; i < Math.min(idx + 8, lines.length); i++) {
        const priceMatch = lines[i].match(priceRegex);
        if (priceMatch) {
          const priceStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
          const price = parseFloat(priceStr);
          if (!isNaN(price) && price > 0 && price < 10000) {
            results.push({ title, price, url, volume: resultVolume || undefined });
            break;
          }
        }
      }
    }

    if (results.length >= 10) break;
  }

  // Filter by volume compatibility, fallback to all if none match
  if (targetVolume) {
    const compatible = results.filter(r => isVolumeCompatible(r.volume || r.title, targetVolume));
    if (compatible.length > 0) return compatible.slice(0, 5);
  }

  return results.slice(0, 5);
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

    const { searchTerms, volume } = normalizeForSearch(product_name);
    const amazonUrl = `https://www.amazon.com.br/s?k=${searchTerms}&s=price-asc-rank`;

    console.log('Scraping Amazon URL:', amazonUrl);

    let results: AmazonProduct[] = [];

    const volumeHint = volume ? ` that match the size/volume '${volume}'.` : '.';
    const extractPrompt = `Extract the first 5 product results with their title, price in BRL as a number, product URL, and size/volume (e.g. 500ml, 1kg). Only include items with a valid price${volumeHint} Prioritize products whose size matches '${volume || 'any'}'.`;

    try {
      const extractResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: amazonUrl,
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
                      price: { type: 'number', description: 'Product price in BRL (e.g. 24.50)' },
                      url: { type: 'string', description: 'Product URL on Amazon' },
                      volume: { type: 'string', description: 'Product size/volume/weight, e.g. 500ml, 1kg, 200g, 1L' },
                    },
                    required: ['title', 'price'],
                  },
                },
              },
              required: ['products'],
            },
            prompt: extractPrompt,
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
        const allProducts = extracted.products
          .filter((p: any) => p.title && typeof p.price === 'number' && p.price > 0)
          .map((p: any) => ({
            title: p.title,
            price: p.price,
            url: p.url || amazonUrl,
            volume: p.volume || undefined,
          }));

        // Filter by volume compatibility
        if (volume && allProducts.length > 0) {
          const compatible = allProducts.filter((p: AmazonProduct) =>
            isVolumeCompatible(p.volume || p.title, volume)
          );
          results = (compatible.length > 0 ? compatible : allProducts).slice(0, 5);
          console.log(`Volume filter: ${compatible.length}/${allProducts.length} compatible with ${volume}`);
        } else {
          results = allProducts.slice(0, 5);
        }
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
            url: amazonUrl,
            formats: ['markdown'],
            waitFor: 5000,
          }),
        });

        const mdData = await mdResponse.json();
        const markdown = mdData?.data?.markdown || mdData?.markdown || '';

        if (markdown) {
          results = parseMarkdownResults(markdown, volume);
        }
      } catch (e) {
        console.error('Markdown fallback also failed:', e);
      }
    }

    console.log(`Found ${results.length} results for "${product_name}"`);

    return new Response(
      JSON.stringify({ success: true, results, search_url: amazonUrl }),
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
