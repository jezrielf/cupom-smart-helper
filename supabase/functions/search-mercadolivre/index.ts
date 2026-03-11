const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalizeForSearch(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
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
          // Try to find a URL nearby
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
  // R$ 12,50 or R$ 1.234,56
  const priceRegex = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
  // Also match plain numbers that look like prices: "1250" (centavos) or "12.50"
  const plainPriceRegex = /(?:^|\s)(\d{1,5}[.,]\d{2})(?:\s|$)/;

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
    const mlUrl = `https://lista.mercadolivre.com.br/supermercado/market/${normalized}_OrderId_PRICE_NoIndex_True?sb=storefront_url`;

    console.log('Scraping Mercado Livre URL:', mlUrl);

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
          url: mlUrl,
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
            url: p.url || mlUrl,
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
            url: mlUrl,
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

    console.log(`Found ${results.length} ML results for "${product_name}"`);

    return new Response(
      JSON.stringify({ success: true, results, search_url: mlUrl }),
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
