"use client";

import { useState, useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertTriangle,
  FileText,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export type PdfViewerHandle = {
  goToPage: (page: number) => void;
  highlightText: (quote: string, page?: number) => void;
  clearHighlight: () => void;
};

type Props = {
  url: string;
  activePage?: number;
  highlightQuote?: string;
  onPageChange?: (page: number) => void;
};

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(
  function PdfViewer({ url, activePage, highlightQuote, onPageChange }, ref) {
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState(activePage || 1);
    const [scale, setScale] = useState(1.0);
    const [error, setError] = useState<string | null>(null);
    const [activeQuote, setActiveQuote] = useState<string | null>(highlightQuote || null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Expose imperative methods for parent components
    useImperativeHandle(ref, () => ({
      goToPage: (page: number) => {
        setPageNumber(Math.max(1, Math.min(page, numPages || page)));
        onPageChange?.(page);
      },
      highlightText: (quote: string, page?: number) => {
        if (page) {
          setPageNumber(page);
          onPageChange?.(page);
        }
        setActiveQuote(quote);
      },
      clearHighlight: () => {
        setActiveQuote(null);
      },
    }));

    // Respond to external activePage changes
    useEffect(() => {
      if (activePage && activePage !== pageNumber && activePage <= numPages) {
        setPageNumber(activePage);
      }
    }, [activePage, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

    // Respond to external highlightQuote changes
    useEffect(() => {
      setActiveQuote(highlightQuote || null);
    }, [highlightQuote]);

    // Highlight matching text in the rendered page after render
    useEffect(() => {
      if (!activeQuote || !containerRef.current) return;

      // Wait for text layer to render
      const timer = setTimeout(() => {
        const textLayer = containerRef.current?.querySelector(".react-pdf__Page__textContent");
        if (!textLayer) return;

        // Clear previous highlights
        textLayer.querySelectorAll(".source-highlight").forEach((el) => el.remove());

        // Find matching text spans
        const spans = Array.from(textLayer.querySelectorAll("span"));
        const normalizedQuote = activeQuote.toLowerCase().replace(/\s+/g, " ").trim();

        // Build concatenated text with span mapping
        let fullText = "";
        const spanMap: { start: number; end: number; span: Element }[] = [];
        for (const span of spans) {
          const text = span.textContent || "";
          const start = fullText.length;
          fullText += text + " ";
          spanMap.push({ start, end: start + text.length, span });
        }

        const normalizedFull = fullText.toLowerCase().replace(/\s+/g, " ");
        const matchIdx = normalizedFull.indexOf(normalizedQuote);

        if (matchIdx === -1) return;

        // Find which spans overlap the match
        const matchEnd = matchIdx + normalizedQuote.length;
        for (const { start, end, span } of spanMap) {
          if (end > matchIdx && start < matchEnd) {
            const rect = span.getBoundingClientRect();
            const layerRect = textLayer.getBoundingClientRect();

            const highlight = document.createElement("div");
            highlight.className = "source-highlight";
            highlight.style.cssText = `
              position: absolute;
              left: ${rect.left - layerRect.left}px;
              top: ${rect.top - layerRect.top}px;
              width: ${rect.width}px;
              height: ${rect.height}px;
              background: rgba(59, 130, 246, 0.25);
              border-bottom: 2px solid rgb(59, 130, 246);
              pointer-events: none;
              z-index: 5;
              transition: opacity 0.3s;
            `;
            textLayer.appendChild(highlight);

            // Scroll highlight into view
            span.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }, 500);

      return () => clearTimeout(timer);
    }, [activeQuote, pageNumber]);

    const onDocumentLoadSuccess = useCallback(
      ({ numPages: n }: { numPages: number }) => {
        setNumPages(n);
        if (!activePage) setPageNumber(1);
        setError(null);
      },
      [activePage]
    );

    const onDocumentLoadError = useCallback(() => {
      setError("Failed to load PDF document");
    }, []);

    const goToPrev = () => {
      const p = Math.max(1, pageNumber - 1);
      setPageNumber(p);
      onPageChange?.(p);
    };

    const goToNext = () => {
      const p = Math.min(numPages, pageNumber + 1);
      setPageNumber(p);
      onPageChange?.(p);
    };

    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={pageNumber <= 1}
              onClick={goToPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums min-w-[80px] text-center">
              {numPages > 0
                ? `Page ${pageNumber} of ${numPages}`
                : "Loading..."}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={pageNumber >= numPages}
              onClick={goToNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {activeQuote && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-blue-600"
                onClick={() => setActiveQuote(null)}
              >
                <FileText className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={scale <= 0.5}
              onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums min-w-[40px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={scale >= 2.5}
              onClick={() => setScale((s) => Math.min(2.5, s + 0.25))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF Content */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-100 flex justify-center p-4">
          {error ? (
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <AlertTriangle className="h-10 w-10 text-neutral-400" />
              <p className="text-sm text-neutral-500">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  setPageNumber(1);
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center gap-2 text-neutral-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading PDF...</span>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={
                  <div className="flex items-center gap-2 text-neutral-400 py-8">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Rendering page...</span>
                  </div>
                }
              />
            </Document>
          )}
        </div>
      </div>
    );
  }
);
