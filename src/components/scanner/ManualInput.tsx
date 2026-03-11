import { useState } from "react";
import { Search, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ManualInputProps {
  onSubmit: (value: string, type: "url" | "access_key") => void;
  disabled?: boolean;
}

export function ManualInput({ onSubmit, disabled }: ManualInputProps) {
  const [url, setUrl] = useState("");
  const [accessKey, setAccessKey] = useState("");

  const formatAccessKey = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 44);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const handleAccessKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAccessKey(formatAccessKey(e.target.value));
  };

  const rawKey = accessKey.replace(/\s/g, "");

  return (
    <Tabs defaultValue="url" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="url">URL do QR Code</TabsTrigger>
        <TabsTrigger value="key">Chave de Acesso</TabsTrigger>
      </TabsList>

      <TabsContent value="url" className="space-y-4 mt-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Cole a URL do QR Code do cupom fiscal.
          </p>
          <Input
            placeholder="https://nfce.fazenda.mg.gov.br/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
          />
        </div>
        <Button
          onClick={() => onSubmit(url, "url")}
          disabled={disabled || !url.trim()}
          className="w-full gap-2"
        >
          <Search className="h-4 w-4" />
          Buscar Cupom
        </Button>
      </TabsContent>

      <TabsContent value="key" className="space-y-4 mt-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Digite os 44 dígitos da chave de acesso do cupom fiscal.
          </p>
          <Input
            placeholder="3125 0312 3456 7890 0012 3400 0001 2345 6789 0123 4567"
            value={accessKey}
            onChange={handleAccessKeyChange}
            disabled={disabled}
            className="font-mono text-sm tracking-wider"
          />
          <p className="text-xs text-muted-foreground text-right">
            {rawKey.length}/44 dígitos
          </p>
        </div>
        <Button
          onClick={() => onSubmit(rawKey, "access_key")}
          disabled={disabled || rawKey.length !== 44}
          className="w-full gap-2"
        >
          <Key className="h-4 w-4" />
          Buscar Cupom
        </Button>
      </TabsContent>
    </Tabs>
  );
}
