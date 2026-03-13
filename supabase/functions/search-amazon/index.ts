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
  'la': 'la de', 'aco': 'aco', 'po': 'po',
};

const PACKAGING_CODES = /\b(pc|pt|gl|fr|sc|tp|gr|cx|fd|bd|lt|un|dp|tb|env|fl|sq|pct|gar|sac)\b/g;
const WEIGHT_VOLUME = /\b(\d+([.,]\d+)?)\s*(g|kg|ml|l)\b/gi;

function normalizeForSearch(name: string): { query: string; volume: string | null; brandWords: string[] } {
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

  const rawWords = normalized.replace(WEIGHT_VOLUME, ' ').replace(PACKAGING_CODES, ' ')
    .replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(w => w.length > 2);
  const genericWords = new Set(['com', 'para', 'sem', 'tipo', 'sabor', 'aroma', 'zero', 'light', 'diet']);
  const brandWords = rawWords.filter(w => !ABBREVIATION_MAP[w] && !genericWords.has(w) && w.length > 3);

  normalized = normalized.replace(WEIGHT_VOLUME, ' ');
  normalized = normalized.replace(PACKAGING_CODES, ' ');
  normalized = normalized.replace(/\b([a-z]+)\b/g, (m) => ABBREVIATION_MAP[m] || m);
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  normalized = normalized.trim().replace(/\s+/g, ' ');

  const query = volume ? `${normalized} ${volume}` : normalized;
  console.log(`Amazon search: "${name}" → "${query}" (volume: ${volume}, brands: ${brandWords.join(',')})`);
  return { query, volume, brandWords };
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

function detectPackQuantity(title: string): number {
  const lower = title.toLowerCase();
  const patterns = [
    /(\d+)\s*x\s*\d/i,
    /c\/?o?m?\s*(\d+)\s*(unid|un\b|und|pct|pacote|sach)/i,
    /(\d+)\s*(unid|unidades)\b/i,
    /pack\s*(?:com|c\/)?\s*(\d+)/i,
    /fardo\s*(?:com|c\/)?\s*(\d+)/i,
    /caixa\s*(?:com|c\/)?\s*(\d+)/i,
    /kit\s*(?:com|c\/)?\s*(\d+)/i,
    /(\d+)\s*(?:rolos|pares|sachets|saches|latas|garrafas|pacotes)\b/i,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m) {
      const qty = parseInt(m[1], 10);
      if (qty > 1 && qty <= 200) return qty;
    }
  }
  return 1;
}

function calculateRelevance(originalName: string, resultTitle: string, brandWords: string[]): number {
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(w => w.length > 2);

  const origWords = normalize(originalName);
  const titleWords = normalize(resultTitle);
  const titleText = titleWords.join(' ');

  if (origWords.length === 0) return 0;

  let matches = 0;
  for (const w of origWords) {
    if (titleText.includes(w)) matches++;
  }

  let score = matches / origWords.length;

  for (const brand of brandWords) {
    if (titleText.includes(brand)) {
      score += 0.2;
    } else if (brandWords.length > 0) {
      score -= 0.15;
    }
  }

  return Math.max(0, Math.min(1, score));
}

// Extract price from Google search description/snippet
function extractPriceFromText(text: string): number | null {
  if (!text) return null;
  // Match Brazilian price patterns: R$ 29,90 or R$29.90 or 29,90
  const patterns = [
    /R\$\s*(\d+[.,]\d{2})/,
    /R\$\s*(\d+)/,
    /(\d+[.,]\d{2})\s*(?:reais|BRL)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const price = parseFloat(m[1].replace('.', '').replace(',', '.'));
      if (price > 0 && price < 100000) return price;
    }
  }
  return null;
}

interface AmazonProduct {
  title: string;
  price: number;
  url: string;
  volume?: string;
  is_prime?: boolean;
  rating?: number;
  reviews_count?: number;
  discount_percent?: number;
  image_url?: string;
  relevance?: number;
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

    const { query, volume, brandWords } = normalizeForSearch(product_name);
    const searchQuery = `site:amazon.com.br ${query}`;
    const amazonSearchUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`;

    console.log('Searching Amazon via Google:', searchQuery);

    // Use Firecrawl SEARCH endpoint (goes through Google, avoids Amazon blocking)
    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 10,
        lang: 'pt-br',
        country: 'br',
        scrapeOptions: {
          formats: ['extract'],
          extract: {
            schema: {
              type: 'object',
              properties: {
                titulo: { type: 'string', description: 'Título completo do produto na página da Amazon' },
                preco: { type: 'number', description: 'Preço à vista em reais (ex: 29.90). NÃO incluir frete ou parcela.' },
                prime: { type: 'boolean', description: 'Se o produto tem selo Amazon Prime' },
                avaliacao: { type: 'number', description: 'Nota de avaliação de 0 a 5 (ex: 4.5)' },
                num_avaliacoes: { type: 'number', description: 'Número total de avaliações' },
                desconto_percent: { type: 'number', description: 'Percentual de desconto se houver (ex: 15)' },
                imagem_url: { type: 'string', description: 'URL da imagem principal do produto' },
                quantidade_unidades: { type: 'number', description: 'Quantidade de unidades no pack/fardo/kit. Se unitário, retorne 1.' },
              },
              required: ['titulo', 'preco'],
            },
            prompt: 'Extraia as informações do produto Amazon desta página: título completo, preço à vista em reais (NÃO frete, NÃO parcela), se tem Prime, avaliação, número de avaliações, desconto, URL da imagem e quantidade de unidades se for pack/fardo/kit.',
          },
        },
      }),
    });

    const searchData = await searchResponse.json();

    if (!searchResponse.ok) {
      console.error('Search error:', searchResponse.status, JSON.stringify(searchData).substring(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: searchData.error || 'Search failed' }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process search results - each result has url, title, description, and optionally extract data
    const searchResults = searchData?.data || searchData?.results || [];
    console.log(`Got ${searchResults.length} search results from Google`);

    const results: AmazonProduct[] = [];

    for (const result of searchResults) {
      try {
        const url = result.url || '';
        // Only process Amazon product pages
        if (!url.includes('amazon.com.br')) continue;
        if (!url.includes('/dp/') && !url.includes('/gp/')) continue;

        // Try to get data from extract (scraped page)
        const extract = result.extract || {};
        const title = extract.titulo || result.title || '';
        if (!title || title.length < 5) continue;

        // Try price from extract, then from description snippet
        let price = extract.preco || null;
        if (!price && result.description) {
          price = extractPriceFromText(result.description);
        }
        if (!price || price <= 0) continue;

        // Calculate unit price for packs
        const scrapedUnits = extract.quantidade_unidades && extract.quantidade_unidades > 1 ? extract.quantidade_unidades : 1;
        const regexUnits = detectPackQuantity(title);
        const units = Math.max(scrapedUnits, regexUnits);
        const unitPrice = units > 1 ? price / units : price;
        const titleSuffix = units > 1 ? ` (preço por unidade — pack c/ ${units})` : '';

        // Calculate relevance
        const relevance = calculateRelevance(product_name, title, brandWords);
        console.log(`  "${title.substring(0, 50)}" → R$${unitPrice.toFixed(2)} (${units}un) relevance=${(relevance * 100).toFixed(0)}%`);

        if (relevance < 0.3) {
          console.log(`  ✗ Skipped (low relevance)`);
          continue;
        }

        results.push({
          title: title.substring(0, 200) + titleSuffix,
          price: Math.round(unitPrice * 100) / 100,
          url: url,
          volume: parseVolume(title) || undefined,
          is_prime: extract.prime || false,
          rating: extract.avaliacao || undefined,
          reviews_count: extract.num_avaliacoes || undefined,
          discount_percent: extract.desconto_percent || undefined,
          image_url: extract.imagem_url || undefined,
          relevance,
        });
      } catch (e) {
        console.error('Error processing search result:', e);
        continue;
      }
    }

    // Volume filter
    let filteredResults = results;
    if (volume && results.length > 0) {
      const compatible = results.filter(r => isVolumeCompatible(r.volume || r.title, volume));
      if (compatible.length > 0) {
        filteredResults = compatible;
        console.log(`Volume filter: ${compatible.length}/${results.length} compatible with ${volume}`);
      }
    }

    // Sort by relevance-weighted price
    filteredResults.sort((a, b) => {
      const scoreA = a.price / (a.relevance || 0.5);
      const scoreB = b.price / (b.relevance || 0.5);
      return scoreA - scoreB;
    });

    const finalResults = filteredResults.slice(0, 5);
    console.log(`Found ${finalResults.length} Amazon results for "${product_name}"`);

    return new Response(
      JSON.stringify({ success: true, results: finalResults, search_url: amazonSearchUrl }),
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
