import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QRScannerCameraProps {
  onScan: (url: string) => void;
  disabled?: boolean;
}

export function QRScannerCamera({ onScan, disabled }: QRScannerCameraProps) {
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // Always-fresh reference to onScan so the RAF loop never holds a stale closure
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  /** Stop tracks and cancel the animation frame without touching React state */
  const releaseCamera = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const stopScanner = () => {
    releaseCamera();
    setStatus("idle");
  };

  /** RAF loop — reads from refs only, safe across re-renders */
  const scan = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // Stop if camera was released
    if (!streamRef.current || !video || !canvas) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code?.data) {
          releaseCamera();
          setStatus("idle");
          onScanRef.current(code.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(scan);
  };

  const startScanner = async () => {
    if (status === "scanning" || status === "starting") return;
    setStatus("starting");
    setErrorMsg(null);

    try {
      let stream: MediaStream;
      try {
        // Prefer rear camera (environment) — covers most phones
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        // OverconstrainedError on older iOS or desktop → fall back to any camera
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("scanning");
      rafRef.current = requestAnimationFrame(scan);
    } catch (err: unknown) {
      streamRef.current = null;
      const name = (err as { name?: string })?.name ?? "";
      const msg = (err as { message?: string })?.message?.toLowerCase() ?? "";
      const denied = name === "NotAllowedError" || msg.includes("permission") || msg.includes("denied");
      setErrorMsg(
        denied
          ? "Permissão da câmera negada. Verifique as configurações do navegador."
          : "Não foi possível acessar a câmera."
      );
      setStatus("error");
    }
  };

  /** Scan a QR code from an image file using an offscreen canvas */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);
      URL.revokeObjectURL(objectUrl);
      if (code?.data) {
        onScanRef.current(code.data);
      } else {
        setErrorMsg("Não foi possível ler o QR Code da imagem.");
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setErrorMsg("Erro ao carregar a imagem.");
    };
    img.src = objectUrl;
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Release camera on unmount
  useEffect(() => () => releaseCamera(), []);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Preview area */}
      <div className="relative w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-muted/50 border border-border">
        {/* playsInline is required for iOS Safari; muted prevents autoplay block */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        {/* Off-screen canvas for frame decoding */}
        <canvas ref={canvasRef} className="hidden" />

        {status === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Câmera desligada
          </div>
        )}
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>

      {errorMsg && (
        <p className="text-sm text-destructive text-center px-2">{errorMsg}</p>
      )}

      <div className="flex gap-3">
        {status !== "scanning" ? (
          <Button
            onClick={startScanner}
            disabled={disabled || status === "starting"}
            className="gap-2"
          >
            {status === "starting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {status === "starting" ? "Iniciando..." : "Iniciar Câmera"}
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
        {/*
          No `capture` attribute: lets iOS show "choose file" sheet (photo library)
          instead of forcing the camera, which is confusing when user wants a screenshot
        */}
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
