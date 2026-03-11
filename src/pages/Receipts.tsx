import { FileText } from "lucide-react";

export default function Receipts() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <FileText className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">Meus Cupons</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Veja todos os seus cupons fiscais com filtros e detalhes completos.
      </p>
    </div>
  );
}
