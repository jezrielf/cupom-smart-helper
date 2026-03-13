import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { products, catalog, price_history_summary } = await req.json();

    if (!products || !Array.isArray(products) || products.length === 0) {
      return new Response(JSON.stringify({ error: "products array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um especialista em produtos de supermercado brasileiro. Sua tarefa é:

1. NORMALIZAR nomes de produtos de cupom fiscal (que vêm abreviados) para nomes completos e legíveis.
2. VINCULAR produtos com entradas existentes no catálogo quando forem o mesmo produto.
3. GERAR insights e sugestões baseadas no histórico de preços.

Regras de normalização:
- "MAC ADRIA ESPAG 500G" → "MACARRÃO ADRIA ESPAGUETE 500G"
- "ARR CAMIL T1 5KG" → "ARROZ CAMIL TIPO 1 5KG"
- "SAB PO OMO 800G" → "SABÃO EM PÓ OMO 800G"
- Sempre use acentos corretos em português
- Extraia marca, peso em gramas e categoria quando possível
- Categorias comuns: Arroz e Grãos, Massas, Laticínios, Carnes, Bebidas, Limpeza, Higiene, Hortifruti, Padaria, Congelados, Temperos, Enlatados, Snacks, Óleos, Farinhas

Para vinculação:
- Compare o nome normalizado com os nomes do catálogo existente
- Considere variações de grafia e abreviações
- Só vincule com confidence >= 0.8

Para insights:
- price_alert: preço subiu mais de 10% comparado à média
- cheaper_alternative: produto similar mais barato em outro supermercado
- forgotten_product: produto com recorrência configurada que não foi comprado recentemente
- best_time_to_buy: padrão de preço identificado (ex: mais barato no começo do mês)`;

    const userPrompt = `Analise os seguintes produtos de cupom fiscal:

PRODUTOS DO CUPOM:
${JSON.stringify(products, null, 2)}

CATÁLOGO EXISTENTE:
${JSON.stringify(catalog || [], null, 2)}

HISTÓRICO DE PREÇOS (resumo):
${JSON.stringify(price_history_summary || [], null, 2)}

Use as ferramentas disponíveis para retornar a análise completa.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "analyze_products",
          description: "Retorna a análise completa dos produtos: normalização, vinculação com catálogo e sugestões inteligentes.",
          parameters: {
            type: "object",
            properties: {
              normalized_products: {
                type: "array",
                description: "Lista de produtos normalizados",
                items: {
                  type: "object",
                  properties: {
                    original_name: { type: "string", description: "Nome original do cupom" },
                    canonical_name: { type: "string", description: "Nome normalizado completo em português" },
                    brand: { type: "string", description: "Marca do produto (ou null se não identificada)" },
                    weight_g: { type: "number", description: "Peso em gramas (converter kg para g). Null se não identificado" },
                    category: { type: "string", description: "Categoria do produto" },
                  },
                  required: ["original_name", "canonical_name"],
                  additionalProperties: false,
                },
              },
              catalog_matches: {
                type: "array",
                description: "Vinculações entre produtos do cupom e entradas do catálogo existente",
                items: {
                  type: "object",
                  properties: {
                    product_name: { type: "string", description: "Nome normalizado do produto do cupom" },
                    matched_catalog_id: { type: "string", description: "ID da entrada no catálogo que corresponde" },
                    matched_catalog_name: { type: "string", description: "Nome canônico da entrada no catálogo" },
                    confidence: { type: "number", description: "Grau de confiança da vinculação (0 a 1)" },
                  },
                  required: ["product_name", "matched_catalog_id", "confidence"],
                  additionalProperties: false,
                },
              },
              suggestions: {
                type: "array",
                description: "Sugestões e alertas inteligentes",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["price_alert", "cheaper_alternative", "forgotten_product", "best_time_to_buy"],
                      description: "Tipo da sugestão",
                    },
                    message: { type: "string", description: "Mensagem da sugestão em português" },
                    product_name: { type: "string", description: "Produto relacionado à sugestão" },
                  },
                  required: ["type", "message", "product_name"],
                  additionalProperties: false,
                },
              },
            },
            required: ["normalized_products", "catalog_matches", "suggestions"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "analyze_products" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "analyze_products") {
      console.error("Unexpected AI response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "Resposta inesperada da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;
    try {
      result = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Erro ao processar resposta da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-product-intelligence error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
