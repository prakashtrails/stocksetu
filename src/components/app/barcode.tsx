"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function BarcodeSvg({ value, height = 64 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, value, { format: "CODE128", height, displayValue: true, fontSize: 14, margin: 8 });
    }
  }, [value, height]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />;
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass({ variant: "outline", size: "sm" }, "print:hidden")}>
      <Printer className="size-4" /> {label}
    </button>
  );
}
