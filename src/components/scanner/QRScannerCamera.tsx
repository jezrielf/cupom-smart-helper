import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QRScannerCameraProps {
  onScan: (url: string) => void;
  disabled?: boolean;
}

export function QRScannerCamera({ onScan, disabled }: QRScannerCameraProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startScanner = async () => {
    if (!containerRef.current || scannerRef.current) return;

    try {
      setError(null);
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScan(decodedText);
          stopScanner();
        },
        () => {} // ignore scan failures
      );
      setIsScanning(true);
    } catch (err: any) {
      setError(
        err?.message?.includes("Permission")
          ? "Permissão da câmera negada. Verifique as configurações do navegador."
          : "Não foi possível acessar a câmera."
      );
      scannerRef.current = null;
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const scanner = new Html5Qrcode("qr-reader-file");
      const result = await scanner.scanFile(file, true);
      onScan(result);
      scanner.clear();
    } catch {
      setError("Não foi possível ler o QR Code da imagem.");
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        id="qr-reader"
        ref={containerRef}
        className="w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-muted/50 border border-border"
      />
      {/* Hidden container for file scanning */}
      <div id="qr-reader-file" className="hidden" />

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <div className="flex gap-3">
        {!isScanning ? (
          <Button onClick={startScanner} disabled={disabled} className="gap-2">
            <Camera className="h-4 w-4" />
            Iniciar Câmera
          </Button>
        ) : (
          <Button onClick={stopScanner} variant="outline" className="gap-2">
            <CameraOff className="h-4 w-4" />
            Parar Câmera
          </Button>
        )}

        <Button
          variant="outline"
          disabled={disabled}
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Galeria
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>
    </div>
  );
}
