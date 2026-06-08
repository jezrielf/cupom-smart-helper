import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, BrowserCodeReader } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import {
  Camera,
  CameraOff,
  ImageIcon,
  Keyboard,
  Key,
  Loader2,
  RefreshCw,
  Search,
  SwitchCamera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraStatus = "idle" | "requesting" | "scanning" | "error";

interface VideoDevice {
  deviceId: string;
  label: string;
}

interface QRScannerCameraProps {
  onScan: (decodedText: string) => void;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QRScannerCamera({ onScan, disabled }: QRScannerCameraProps) {
  // ── Camera state ──────────────────────────────────────────────────────────
  const [camStatus, setCamStatusState] = useState<CameraStatus>("idle");
  // Ref-mirrored status so async functions never see stale state
  const camStatusRef = useRef<CameraStatus>("idle");
  const setCamStatus = (s: CameraStatus) => {
    camStatusRef.current = s;
    setCamStatusState(s);
  };

  const [camError, setCamError] = useState<string | null>(null);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);

  // ── Photo state ───────────────────────────────────────────────────────────
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── Code tab state ────────────────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [accessKey, setAccessKey] = useState("");

  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  // { stop() } — using structural type so we don't import IScannerControls
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const devicesRef = useRef<VideoDevice[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Always-fresh onScan so the RAF/ZXing callback never holds a stale closure
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // ── Camera helpers ────────────────────────────────────────────────────────

  const stopCamera = () => {
    try { controlsRef.current?.stop(); } catch { /* ignore */ }
    controlsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamStatus("idle");
  };

  const startCamera = async (deviceId?: string) => {
    // Guard: never start if already in-flight or scanning
    if (camStatusRef.current === "requesting" || camStatusRef.current === "scanning") return;
    setCamStatus("requesting");
    setCamError(null);

    try {
      const reader = new BrowserMultiFormatReader();

      const controls = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current!,
        (result, error) => {
          if (result) {
            const text = result.getText();
            stopCamera();
            onScanRef.current(text);
          }
          // NotFoundException = no QR code in this frame — completely normal, ignore
          if (error && !(error instanceof NotFoundException)) {
            console.warn("[ZXing]", (error as Error).name, (error as Error).message);
          }
        },
      );

      // stopCamera() was called by the user while the promise was in flight
      if (camStatusRef.current === "idle") {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
      setCamStatus("scanning");

      // Non-blocking: load device list for the "Trocar câmera" button
      BrowserCodeReader.listVideoInputDevices()
        .then((raw) => {
          const list = raw.map((d) => ({ deviceId: d.deviceId, label: d.label }));
          devicesRef.current = list;
          setDevices(list);
        })
        .catch(() => { /* not critical */ });

    } catch (err: unknown) {
      // stopCamera() already ran — don't overwrite "idle" with "error"
      if (camStatusRef.current === "idle") return;

      controlsRef.current = null;
      const name = (err as { name?: string })?.name ?? "";

      // OverconstrainedError: the requested deviceId can't satisfy the constraint.
      // Retry without specifying a device (browser picks the default camera).
      if (name === "OverconstrainedError" && deviceId) {
        setCamStatus("idle");
        startCamera(undefined);
        return;
      }

      const msg =
        name === "NotAllowedError"
          ? "Permissão negada. Habilite a câmera nas configurações do navegador."
          : name === "NotFoundError"
          ? "Nenhuma câmera encontrada neste dispositivo."
          : "Não foi possível iniciar a câmera.";

      setCamError(msg);
      setCamStatus("error");
    }
  };

  const switchCamera = () => {
    const list = devicesRef.current;
    if (list.length < 2) return;
    const next = (deviceIdx + 1) % list.length;
    setDeviceIdx(next);
    stopCamera();
    // Brief pause so the video element can reset before ZXing re-acquires it
    setTimeout(() => startCamera(list[next].deviceId), 150);
  };

  // ── iOS camera-revoke: stop gracefully when the tab loses focus ───────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && camStatusRef.current === "scanning") stopCamera();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []); // uses refs only — no stale closure

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      try { controlsRef.current?.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
    };
  }, []);

  // ── Photo processing ──────────────────────────────────────────────────────

  const processImageFile = async (file: File) => {
    setPhotoError(null);
    setPhotoLoading(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      onScanRef.current(result.getText());
    } catch {
      setPhotoError(
        "QR Code não encontrado na imagem. Certifique-se de que o código está nítido e totalmente visível.",
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
      setPhotoLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) processImageFile(file);
  };

  // ── Code tab helpers ──────────────────────────────────────────────────────

  const formatKey = (value: string) =>
    value.replace(/\D/g, "").slice(0, 44).replace(/(\d{4})(?=\d)/g, "$1 ");

  const rawKey = accessKey.replace(/\s/g, "");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Tabs defaultValue="camera" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="camera" className="gap-1.5">
          <Camera className="h-4 w-4" />
          <span>Câmera</span>
        </TabsTrigger>
        <TabsTrigger value="photo" className="gap-1.5">
          <ImageIcon className="h-4 w-4" />
          <span>Enviar Foto</span>
        </TabsTrigger>
        <TabsTrigger value="code" className="gap-1.5">
          <Keyboard className="h-4 w-4" />
          <span>Digitar</span>
        </TabsTrigger>
      </TabsList>

      {/* ════════════════════════════════ CÂMERA ═══════════════════════════════ */}
      <TabsContent value="camera" className="mt-4 space-y-3">
        {/* Preview */}
        <div className="relative w-full max-w-sm mx-auto aspect-square rounded-xl overflow-hidden bg-muted/50 border border-border">
          {/* playsInline + muted: required for iOS Safari autoplay */}
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />

          {camStatus === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Camera className="h-14 w-14 opacity-20" />
              <span className="text-sm">Câmera desligada</span>
            </div>
          )}

          {camStatus === "requesting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Acessando câmera...</span>
            </div>
          )}

          {camStatus === "scanning" && (
            /* Viewfinder — dark overlay with a clear window in the centre */
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-52 rounded-lg ring-[9999px] ring-black/40 border-2 border-primary/80" />
            </div>
          )}
        </div>

        {camError && (
          <p className="text-sm text-destructive text-center px-2">{camError}</p>
        )}

        {/* Controls */}
        <div className="flex justify-center gap-2">
          {camStatus !== "scanning" ? (
            <Button
              onClick={() => startCamera()}
              disabled={disabled || camStatus === "requesting"}
              className="gap-2"
            >
              {camStatus === "requesting" && <Loader2 className="h-4 w-4 animate-spin" />}
              {camStatus === "error" && <RefreshCw className="h-4 w-4" />}
              {camStatus === "idle" && <Camera className="h-4 w-4" />}
              {camStatus === "requesting"
                ? "Iniciando..."
                : camStatus === "error"
                ? "Tentar novamente"
                : "Iniciar câmera"}
            </Button>
          ) : (
            <>
              <Button onClick={stopCamera} variant="outline" className="gap-2">
                <CameraOff className="h-4 w-4" />
                Parar
              </Button>
              {devices.length > 1 && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={switchCamera}
                  title="Trocar câmera"
                >
                  <SwitchCamera className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </TabsContent>

      {/* ═══════════════════════════════ FOTO ══════════════════════════════════ */}
      <TabsContent value="photo" className="mt-4 space-y-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Selecionar imagem com QR Code"
          className={[
            "flex flex-col items-center justify-center gap-3 p-10 rounded-xl",
            "border-2 border-dashed transition-colors cursor-pointer select-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/40 hover:bg-muted/30",
          ].join(" ")}
          onClick={() => !photoLoading && fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && !photoLoading && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {photoLoading ? (
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          ) : (
            <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              {photoLoading ? "Lendo QR Code..." : "Clique ou arraste uma imagem"}
            </p>
            {!photoLoading && (
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, WEBP — captura de tela do cupom
              </p>
            )}
          </div>
          {!photoLoading && (
            <Button variant="outline" size="sm" className="pointer-events-none" tabIndex={-1}>
              Escolher arquivo
            </Button>
          )}
        </div>

        {photoError && (
          <p className="text-sm text-destructive text-center px-2">{photoError}</p>
        )}

        {/* No `capture` attribute: shows "Photo Library" on iOS instead of forcing camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </TabsContent>

      {/* ══════════════════════════════ DIGITAR ════════════════════════════════ */}
      <TabsContent value="code" className="mt-4">
        <Tabs defaultValue="url" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url">URL do QR Code</TabsTrigger>
            <TabsTrigger value="key">Chave de Acesso</TabsTrigger>
          </TabsList>

          {/* URL sub-tab */}
          <TabsContent value="url" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Cole a URL do QR Code do cupom fiscal.
            </p>
            <Input
              placeholder="https://portalsped.fazenda.mg.gov.br/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={disabled}
            />
            <Button
              onClick={() => { if (url.trim()) { onScan(url.trim()); setUrl(""); } }}
              disabled={disabled || !url.trim()}
              className="w-full gap-2"
            >
              <Search className="h-4 w-4" />
              Buscar Cupom
            </Button>
          </TabsContent>

          {/* Access-key sub-tab */}
          <TabsContent value="key" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Digite os 44 dígitos da chave de acesso do cupom fiscal.
            </p>
            <Input
              placeholder="3125 0312 3456 7890 0012 3400 0001 2345 6789 0123 4567"
              value={accessKey}
              onChange={(e) => setAccessKey(formatKey(e.target.value))}
              disabled={disabled}
              className="font-mono text-sm tracking-wider"
            />
            <p className="text-xs text-muted-foreground text-right">
              {rawKey.length}/44 dígitos
            </p>
            <Button
              onClick={() => { if (rawKey.length === 44) { onScan(rawKey); setAccessKey(""); } }}
              disabled={disabled || rawKey.length !== 44}
              className="w-full gap-2"
            >
              <Key className="h-4 w-4" />
              Buscar Cupom
            </Button>
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
