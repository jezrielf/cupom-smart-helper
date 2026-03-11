import { format } from "date-fns";
import { formatProductDetail } from "@/lib/formatUnit";
import { ptBR } from "date-fns/locale";
import { ShoppingCart, Store, Calendar, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export interface ParsedReceipt {
  access_key: string;
  emitter: {
    name: string;
    cnpj: string;
    address: string;
  };
  purchase_date: string;
  products: Array<{
    product_code: string;
    product_name: string;
    product_name_normalized: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }>;
  total_amount: number;
  total_discount: number;
  payment_method: string;
  item_count: number;
  qr_code_url?: string;
  raw_html?: string;
}

interface ReceiptPreviewProps {
  receipt: ParsedReceipt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  saving: boolean;
}

export function ReceiptPreview({
  receipt,
  open,
  onOpenChange,
  onConfirm,
  saving,
}: ReceiptPreviewProps) {
  if (!receipt) return null;

  const date = new Date(receipt.purchase_date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Prévia do Cupom
          </DialogTitle>
          <DialogDescription>
            Confira os dados antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-4">
            {/* Supermarket */}
            <div className="flex items-start gap-3">
              <Store className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">
                  {receipt.emitter.name || "Estabelecimento não identificado"}
                </p>
                {receipt.emitter.cnpj && (
                  <p className="text-xs text-muted-foreground">
                    CNPJ: {receipt.emitter.cnpj}
                  </p>
                )}
                {receipt.emitter.address && (
                  <p className="text-xs text-muted-foreground">
                    {receipt.emitter.address}
                  </p>
                )}
              </div>
            </div>

            {/* Date */}
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm">
                {format(date, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </p>
            </div>

            <Separator />

            {/* Products */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {receipt.item_count} {receipt.item_count === 1 ? "item" : "itens"}
                </p>
              </div>

              <div className="space-y-2">
                {receipt.products.map((product, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-start text-sm"
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="truncate">{product.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.quantity} {product.unit} × R${" "}
                        {product.unit_price.toFixed(2)}
                      </p>
                    </div>
                    <p className="font-medium whitespace-nowrap">
                      R$ {product.total_price.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-1">
              {receipt.total_discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Descontos</span>
                  <span className="text-success">
                    -R$ {receipt.total_discount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>R$ {receipt.total_amount.toFixed(2)}</span>
              </div>
              {receipt.payment_method && (
                <p className="text-xs text-muted-foreground text-right">
                  {receipt.payment_method}
                </p>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar e Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
