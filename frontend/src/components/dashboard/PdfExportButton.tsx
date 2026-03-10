"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  findUnsupportedComputedStyles,
  preparePdfExportTarget,
} from "@/lib/pdfExportSanitizer";

interface PdfExportButtonProps {
  targetId: string;
  filename?: string;
}

export default function PdfExportButton({
  targetId,
  filename = "dashboard.pdf",
}: PdfExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    let cleanupExportTarget: (() => void) | null = null;

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const element = document.getElementById(targetId);
      if (!element) {
        throw new Error(`Element #${targetId} not found`);
      }

      const unsupportedStyles = findUnsupportedComputedStyles(element);
      if (unsupportedStyles.length > 0) {
        console.warn("PDF export sanitized unsupported computed colors:", unsupportedStyles);
      }

      const exportTarget = preparePdfExportTarget(element);
      cleanupExportTarget = exportTarget.cleanup;

      const canvas = await html2canvas(exportTarget.element, {
        backgroundColor: exportTarget.backgroundColor,
        scale: 2,
        useCORS: true,
      });

      const pdfWidth = canvas.width / 2;
      const pdfHeight = canvas.height / 2;
      const pdf = new jsPDF({
        format: [pdfWidth, pdfHeight],
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
      });

      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(filename);
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      cleanupExportTarget?.();
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting}
      className="gap-1.5"
    >
      <Download className="h-3.5 w-3.5" />
      {exporting ? "Exporting..." : "Export PDF"}
    </Button>
  );
}
