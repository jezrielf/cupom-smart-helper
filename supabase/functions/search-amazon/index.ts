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
    .replace(/\s+/g, '+');
}

interface AmazonProduct {
  title: string;
  price: number;
  url: string;
}

function parseMarkdownResults(markdown: string): AmazonProduct[] {
  const results: AmazonProduct[] = [];
  const lines = markdown.split('\n');

  let currentTitle = '';
  for (const line of lines) {
    // Look for product titles (usually in brackets or bold)
    const titleMatch = line.match(/\[([^\]]{10,})\]\((https:\/\/www\.amazon\.com\.br\/[^\s)]+)\)/);
    if (titleMatch) {
      currentTitle = titleMatch[1].trim();
      const url = titleMatch[2];

      // Look for price in nearby lines
      const priceRegex = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
      const idx = lines.indexOf(line);
      for (let i = idx; i < Math.min(idx + 8, lines.length); i++) {
        const priceMatch = lines[i].match(priceRegex);
        if (priceMatch) {
          const priceStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
          const price = parseFloat(priceStr);
          if (!isNaN(price) && price > 0 && price < 10000) {
            results.push({ title: currentTitle, price, url });
            break;
          }
        }
      }
    }

    if (results.length >= 5) break;
  }

  return results;
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
    const amazonUrl = `https://www.amazon.com.br/s?k=${normalized}&s=price-asc-rank`;

    console.log('Scraping Amazon URL:', amazonUrl);

    // Try JSON extraction first
    let results: AmazonProduct[] = [];

    try {
      const jsonResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: amazonUrl,
          formats: [{
            type: 'json',
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
                    },
                    required: ['title', 'price'],
                  },
                },
              },
              required: ['products'],
            },
            prompt: 'Extract the first 5 product results with their title, price in BRL as a number, and product URL. Only include items with a valid price.',
          }],
          waitFor: 3000,
        }),
      });

      const jsonData = await jsonResponse.json();
      console.log('Firecrawl JSON response status:', jsonResponse.status);

      const extracted = jsonData?.data?.json || jsonData?.json;
      if (extracted?.products && Array.isArray(extracted.products)) {
        results = extracted.products
          .filter((p: any) => p.title && typeof p.price === 'number' && p.price > 0)
          .slice(0, 5)
          .map((p: any) => ({
            title: p.title,
            price: p.price,
            url: p.url || amazonUrl,
          }));
      }
    } catch (e) {
      console.error('JSON extraction failed, trying markdown fallback:', e);
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
            waitFor: 3000,
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
