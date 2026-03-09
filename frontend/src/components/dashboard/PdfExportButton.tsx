"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

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

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const element = document.getElementById(targetId);
      if (!element) {
        throw new Error(`Element #${targetId} not found`);
      }

      const rootStyles = getComputedStyle(document.documentElement);
      const backgroundColor = rootStyles.getPropertyValue("--background").trim() || "#ffffff";

      const canvas = await html2canvas(element, {
        backgroundColor,
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
