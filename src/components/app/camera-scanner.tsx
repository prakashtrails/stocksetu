"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/kit";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

// Camera scanning (native BarcodeDetector, ZXing fallback) plus a text box that
// also catches USB / Bluetooth scanners, which type the code and press Enter.
export function CameraScanner({ onCode, autoFocusInput = true }: { onCode: (code: string) => void; autoFocusInput?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const emit = useCallback(
    (code: string) => {
      const c = code.trim();
      if (!c) return;
      const now = Date.now();
      if (lastRef.current.code === c && now - lastRef.current.at < 2000) return;
      lastRef.current = { code: c, at: now };
      navigator.vibrate?.(60);
      onCode(c);
    },
    [onCode],
  );

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setOn(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setOn(true);
      let cancelled = false;
      const stopTracks = () => {
        cancelled = true;
        stream.getTracks().forEach((t) => t.stop());
      };

      const NativeDetector = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
      if (NativeDetector) {
        const detector = new NativeDetector({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code", "code_39"] });
        const loop = async () => {
          if (cancelled) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]) emit(codes[0].rawValue);
          } catch {
            /* frame not ready */
          }
          setTimeout(loop, 250);
        };
        loop();
        stopRef.current = stopTracks;
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) emit(result.getText());
        });
        stopRef.current = () => {
          controls.stop();
          stopTracks();
        };
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera permission was blocked. Allow it in your browser settings, or type / use a USB scanner below."
          : name === "NotFoundError"
            ? "No camera found. Type the code or use a USB scanner below."
            : "Couldn't start the camera. Type the code or use a USB scanner below.",
      );
      stop();
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-ink" style={{ aspectRatio: on ? "4 / 3" : undefined }}>
        <video ref={videoRef} playsInline muted className={on ? "h-full w-full object-cover" : "hidden"} />
        {on && (
          <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-brand-400/80">
            <div className="animate-scanline absolute inset-x-2 top-2 h-0.5 bg-brand-400 shadow-[0_0_12px_2px] shadow-brand-400" />
          </div>
        )}
        {!on && (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-white/80">
            <Camera className="size-8" />
            <p className="text-sm">Point your phone camera at a barcode</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {on ? (
          <button type="button" onClick={stop} className={buttonClass({ variant: "outline" }, "flex-1")}>
            <CameraOff className="size-4" /> Stop camera
          </button>
        ) : (
          <button type="button" onClick={start} className={buttonClass({ variant: "brand" }, "flex-1")}>
            <Camera className="size-4" /> Start camera
          </button>
        )}
      </div>
      {error && <p className="rounded-xl bg-saffron-100/60 px-3 py-2 text-sm text-saffron-600">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          emit(typed);
          setTyped("");
        }}
        className="relative"
      >
        <Keyboard className="pointer-events-none absolute top-3 left-3 size-4 text-muted" />
        <input
          autoFocus={autoFocusInput}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type a code or scan with a USB scanner, then Enter"
          className={inputClass + " pl-9"}
          aria-label="Barcode"
        />
      </form>
    </div>
  );
}
