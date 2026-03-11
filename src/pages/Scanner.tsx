import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, Loader2, Camera, Keyboard } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { QRScannerCamera } from "@/components/scanner/QRScannerCamera";
import { ManualInput } from "@/components/scanner/ManualInput";
import { ReceiptPreview, type ParsedReceipt } from "@/components/scanner/ReceiptPreview";

export default function Scanner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchReceipt = async (value: string, type: "url" | "access_key") => {
    if (loading) return;
    setLoading(true);

    try {
      const body: Record<string, string> = {};
      if (type === "url") {
        body.url = value;
      } else {
        body.access_key = value;
      }

      const { data, error } = await supabase.functions.invoke("fetch-nfce", {
        body,
      });

      if (error) {
        const status = (error as any)?.status;
        if (status === 404) {
          toast.error("Cupom fiscal não encontrado");
        } else if (status === 422) {
          toast.error(data?.error || "Dados inválidos");
        } else if (status === 429) {
          toast.error("Muitas requisições. Tente novamente em alguns segundos.");
        } else {
          toast.error(data?.error || "Erro ao buscar cupom fiscal");
        }
        return;
      }

      if (!data || !data.access_key) {
        toast.error("Não foi possível extrair dados do cupom.");
        return;
      }

      setParsedReceipt(data as ParsedReceipt);
      setPreviewOpen(true);
    } catch (err) {
      toast.error("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleQRScan = (decodedText: string) => {
    // Check if it's a URL or an access key
    if (decodedText.startsWith("http")) {
      fetchReceipt(decodedText, "url");
    } else {
      const digits = decodedText.replace(/\D/g, "");
      if (digits.length === 44) {
        fetchReceipt(digits, "access_key");
      } else {
        // Try as URL anyway
        fetchReceipt(decodedText, "url");
      }
    }
  };

  const handleManualSubmit = (value: string, type: "url" | "access_key") => {
    fetchReceipt(value, type);
  };

  const handleConfirmSave = async () => {
    if (!parsedReceipt || !user) return;
    setSaving(true);

    try {
      // 1. Check if receipt already exists
      const { data: existing } = await supabase
        .from("receipts")
        .select("id")
        .eq("access_key", parsedReceipt.access_key)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        toast.error("Este cupom já foi cadastrado!");
        setPreviewOpen(false);
        setSaving(false);
        return;
      }

      // 2. Find or create supermarket
      let supermarketId: string | null = null;
      if (parsedReceipt.emitter.cnpj) {
        const { data: existingSupermarket } = await supabase
          .from("supermarkets")
          .select("id")
          .eq("cnpj", parsedReceipt.emitter.cnpj)
          .maybeSingle();

        if (existingSupermarket) {
          supermarketId = existingSupermarket.id;
        } else {
          const { data: newSupermarket } = await supabase
            .from("supermarkets")
            .insert({
              cnpj: parsedReceipt.emitter.cnpj,
              name: parsedReceipt.emitter.name || "Supermercado",
              address: parsedReceipt.emitter.address || null,
              state: "MG",
            })
            .select("id")
            .single();

          if (newSupermarket) {
            supermarketId = newSupermarket.id;
          }
        }
      }

      // 3. Insert receipt
      const { data: receiptData, error: receiptError } = await supabase
        .from("receipts")
        .insert({
          user_id: user.id,
          access_key: parsedReceipt.access_key,
          purchase_date: parsedReceipt.purchase_date,
          total_amount: parsedReceipt.total_amount,
          total_discount: parsedReceipt.total_discount,
          item_count: parsedReceipt.item_count,
          payment_method: parsedReceipt.payment_method || null,
          supermarket_id: supermarketId,
          qr_code_url: parsedReceipt.qr_code_url || null,
          raw_html: parsedReceipt.raw_html || null,
        })
        .select("id")
        .single();

      if (receiptError || !receiptData) {
        toast.error("Erro ao salvar cupom.");
        setSaving(false);
        return;
      }

      // 4. Insert products
      if (parsedReceipt.products.length > 0) {
        const productsToInsert = parsedReceipt.products.map((p) => ({
          user_id: user.id,
          receipt_id: receiptData.id,
          product_name: p.product_name,
          product_name_normalized: p.product_name_normalized,
          product_code: p.product_code || null,
          quantity: p.quantity,
          unit: p.unit,
          unit_price: p.unit_price,
          total_price: p.total_price,
          purchase_date: parsedReceipt.purchase_date,
          supermarket_id: supermarketId,
        }));

        await supabase.from("products").insert(productsToInsert);

        // 5. Insert price history
        const priceHistoryToInsert = parsedReceipt.products.map((p) => ({
          product_name_normalized: p.product_name_normalized,
          product_code: p.product_code || null,
          supermarket_id: supermarketId!,
          unit_price: p.unit_price,
          purchase_date: parsedReceipt.purchase_date,
        }));

        if (supermarketId) {
          await supabase.from("price_history").insert(priceHistoryToInsert);
        }
      }

      toast.success(
        `Cupom salvo com ${parsedReceipt.item_count} ${parsedReceipt.item_count === 1 ? "item" : "itens"}!`
      );
      setPreviewOpen(false);
      setParsedReceipt(null);
      navigate("/cupons");
    } catch (err) {
      toast.error("Erro ao salvar cupom.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mx-auto">
          <QrCode className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Ler Cupom</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Escaneie o QR Code ou insira os dados manualmente.
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Buscando cupom fiscal...</p>
        </div>
      )}

      {!loading && (
        <Tabs defaultValue="camera" className="w-full max-w-md mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="camera" className="gap-2">
              <Camera className="h-4 w-4" />
              Câmera
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <Keyboard className="h-4 w-4" />
              Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="camera" className="mt-6">
            <QRScannerCamera onScan={handleQRScan} disabled={loading} />
          </TabsContent>

          <TabsContent value="manual" className="mt-6">
            <ManualInput onSubmit={handleManualSubmit} disabled={loading} />
          </TabsContent>
        </Tabs>
      )}

      <ReceiptPreview
        receipt={parsedReceipt}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onConfirm={handleConfirmSave}
        saving={saving}
      />
    </div>
  );
}
