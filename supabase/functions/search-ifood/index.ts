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

  normalized = normalized.replace(WEIGHT_VOLUME, ' ');
  normalized = normalized.replace(PACKAGING_CODES, ' ');
  normalized = normalized.replace(SIZE_CODES, ' ');

  normalized = normalized.replace(/\b([a-z]+)\b/g, (m) => ABBREVIATION_MAP[m] || m);
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  normalized = normalized.trim().replace(/\s+/g, ' ');

  // Append volume back
  if (volume) {
    normalized = `${normalized} ${volume}`;
  }

  return { searchTerms: normalized, volume };
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

function isVolumeCompatible(resultVolume: string | null, targetVolume: string | null): boolean {
  if (!targetVolume || !resultVolume) return true;
  const target = parseVolume(targetVolume);
  const result = parseVolume(resultVolume);
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

interface IfoodProduct {
  title: string;
  price: number;
  url: string;
  volume?: string;
}

function parseMarkdownResults(markdown: string, targetVolume: string | null): IfoodProduct[] {
  const results: IfoodProduct[] = [];
  const lines = markdown.split('\n');
  const priceRegex = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;

  for (let li = 0; li < lines.length && results.length < 10; li++) {
    const line = lines[li];

    const linkMatch = line.match(/\[([^\]]{5,})\]\((https?:\/\/[^\s)]+)\)/);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      const url = linkMatch[2];
      const price = findPriceNearby(lines, li, priceRegex);
      if (price > 0) {
        results.push({ title, price, url, volume: parseVolume(title) || undefined });
        continue;
      }
    }

    const boldMatch = line.match(/^(?:\*\*|###?\s)(.{10,})(?:\*\*)?$/);
    if (boldMatch) {
      const title = boldMatch[1].replace(/\*\*/g, '').trim();
      const price = findPriceNearby(lines, li, priceRegex);
      if (price > 0) {
        let url = '';
        for (let j = Math.max(0, li - 3); j < Math.min(li + 5, lines.length); j++) {
          const urlMatch = lines[j].match(/\((https?:\/\/[^\s)]+)\)/);
          if (urlMatch) { url = urlMatch[1]; break; }
        }
        results.push({ title, price, url, volume: parseVolume(title) || undefined });
      }
    }
  }

  if (targetVolume) {
    const compatible = results.filter(r => isVolumeCompatible(r.volume || r.title, targetVolume));
    if (compatible.length > 0) return compatible.slice(0, 5);
  }

  return results.slice(0, 5);
}

function findPriceNearby(lines: string[], idx: number, priceRegex: RegExp): number {
  for (let j = idx; j < Math.min(idx + 8, lines.length); j++) {
    const priceMatch = lines[j].match(priceRegex);
    if (priceMatch) {
      const priceStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0 && price < 10000) return price;
    }
  }
  return 0;
}

async function scrapeUrl(apiKey: string, url: string, volume: string | null): Promise<{ results: IfoodProduct[]; searchUrl: string }> {
  let results: IfoodProduct[] = [];

  const volumeHint = volume ? ` that match the size/volume '${volume}'.` : '.';
  const extractPrompt = `Extract the first 5 product results with their title, price in BRL as a number, product URL, and size/volume (e.g. 500ml, 1kg). Only include items with a valid price greater than zero${volumeHint} Prioritize products whose size matches '${volume || 'any'}'.`;

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
                    url: { type: 'string', description: 'Product URL' },
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

    const extracted = extractData?.data?.extract || extractData?.extract;
    if (extracted?.products && Array.isArray(extracted.products)) {
      const allProducts = extracted.products
        .filter((p: any) => p.title && typeof p.price === 'number' && p.price > 0)
        .map((p: any) => ({
          title: p.title,
          price: p.price,
          url: p.url || url,
          volume: p.volume || undefined,
        }));

      if (volume && allProducts.length > 0) {
        const compatible = allProducts.filter((p: IfoodProduct) =>
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
        results = parseMarkdownResults(markdown, volume);
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

    const { searchTerms, volume } = normalizeForSearch(product_name);
    console.log(`Normalized "${product_name}" → "${searchTerms}" (volume: ${volume})`);

    const encodedQuery = encodeURIComponent(searchTerms);
    const ifoodUrl = `https://www.ifood.com.br/busca?q=${encodedQuery}&sort=price_range%3Aasc&term=${encodedQuery}`;
    console.log('Scraping iFood URL:', ifoodUrl);

    const { results, searchUrl } = await scrapeUrl(apiKey, ifoodUrl, volume);

    console.log(`Found ${results.length} iFood results for "${product_name}"`);

    return new Response(
      JSON.stringify({ success: true, results, search_url: searchUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in search-ifood:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
