"use client";

import { useState, useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
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

type OcrWord = {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
};

type OcrPage = {
  page_number: number;
  width: number;
  height: number;
  words: OcrWord[];
};

type Props = {
  url: string;
  activePage?: number;
  highlightQuote?: string;
  ocrPages?: OcrPage[] | null;
  onPageChange?: (page: number) => void;
};

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(
  function PdfViewer({ url, activePage, highlightQuote, ocrPages, onPageChange }, ref) {
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState(activePage || 1);
    const [scale, setScale] = useState(1.0);
    const [error, setError] = useState<string | null>(null);
    const [activeQuote, setActiveQuote] = useState<string | null>(highlightQuote || null);
    const [highlightTrigger, setHighlightTrigger] = useState(0);
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
      if (activePage && activePage <= (numPages || activePage)) {
        setPageNumber(activePage);
      }
    }, [activePage, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

    // Respond to external highlightQuote changes — always force re-trigger
    useEffect(() => {
      setActiveQuote(highlightQuote || null);
      setHighlightTrigger((t) => t + 1);
    }, [highlightQuote]);

    // Highlight matching text in the rendered page after render
    useEffect(() => {
      if (!activeQuote || !containerRef.current) return;

      // Wait for text layer to render, then retry up to 3 times
      let attempts = 0;
      const tryHighlight = () => {
        attempts++;
        const textLayer = containerRef.current?.querySelector(".react-pdf__Page__textContent");
        if (!textLayer) {
          if (attempts < 4) setTimeout(tryHighlight, 500);
          return;
        }

        // Clear previous highlights (from text layer and page element for OCR fallback)
        textLayer.querySelectorAll(".source-highlight").forEach((el) => el.remove());
        containerRef.current?.querySelectorAll(".react-pdf__Page .source-highlight").forEach((el) => el.remove());

        // Find matching text spans
        const spans = Array.from(textLayer.querySelectorAll("span"));
        if (spans.length === 0 && attempts < 4) {
          setTimeout(tryHighlight, 500);
          return;
        }

        // Normalize: collapse whitespace, remove special chars for fuzzy matching
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
        const rawQuote = normalize(activeQuote);

        // Build concatenated text with span mapping
        let fullText = "";
        const spanMap: { start: number; end: number; span: Element }[] = [];
        for (const span of spans) {
          const text = span.textContent || "";
          const start = fullText.length;
          fullText += text + " ";
          spanMap.push({ start, end: start + text.length, span });
        }

        const normalizedFull = normalize(fullText);

        // Try progressively shorter prefixes of the quote
        let matchIdx = -1;
        let matchLen = 0;
        const tryLengths = [rawQuote.length, 100, 60, 40, 25];
        for (const len of tryLengths) {
          if (rawQuote.length < len) continue;
          const prefix = rawQuote.slice(0, len);
          const idx = normalizedFull.indexOf(prefix);
          if (idx !== -1) {
            matchIdx = idx;
            matchLen = prefix.length;
            break;
          }
        }

        if (matchIdx === -1) {
          // Fallback: try OCR bbox-based highlighting for scanned documents
          if (ocrPages && ocrPages.length > 0) {
            const ocrPage = ocrPages.find((p) => p.page_number === pageNumber);
            if (ocrPage && ocrPage.words.length > 0) {
              const ocrNormQuote = rawQuote.toLowerCase();
              // Find consecutive words that match the quote
              const wordTexts = ocrPage.words.map((w) => w.text.toLowerCase().replace(/[^a-z0-9]/g, ""));
              const joined = wordTexts.join(" ");
              let ocrMatchIdx = -1;
              for (const len of [ocrNormQuote.length, 60, 40, 25]) {
                if (ocrNormQuote.length < len) continue;
                ocrMatchIdx = joined.indexOf(ocrNormQuote.slice(0, len));
                if (ocrMatchIdx !== -1) break;
              }
              if (ocrMatchIdx !== -1) {
                // Map character position back to word indices
                let charPos = 0;
                const startWordIdx = wordTexts.findIndex((wt) => {
                  const start = charPos;
                  charPos += wt.length + 1;
                  return start <= ocrMatchIdx && ocrMatchIdx < charPos;
                });
                if (startWordIdx >= 0) {
                  // Get the rendered page element to draw bbox highlights
                  const pageEl = containerRef.current?.querySelector(".react-pdf__Page");
                  if (pageEl) {
                    const pageRect = pageEl.getBoundingClientRect();
                    const renderedW = pageRect.width;
                    const renderedH = pageRect.height;
                    // Highlight ~20 consecutive words from match start
                    const endIdx = Math.min(startWordIdx + 20, ocrPage.words.length);
                    for (let wi = startWordIdx; wi < endIdx; wi++) {
                      const word = ocrPage.words[wi];
                      const hl = document.createElement("div");
                      hl.className = "source-highlight";
                      hl.style.cssText = `
                        position: absolute;
                        left: ${word.bbox.x * renderedW}px;
                        top: ${word.bbox.y * renderedH}px;
                        width: ${word.bbox.w * renderedW}px;
                        height: ${word.bbox.h * renderedH}px;
                        background: rgba(16, 185, 129, 0.25);
                        pointer-events: none;
                        z-index: 5;
                      `;
                      pageEl.appendChild(hl);
                      if (wi === startWordIdx) {
                        const container = containerRef.current;
                        if (container) {
                          const scrollTop = container.scrollTop + (word.bbox.y * renderedH) - pageRect.height / 2;
                          container.scrollTo({ top: scrollTop, behavior: "smooth" });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          return;
        }

        // Map back to original positions — find spans that overlap
        // Since we stripped non-alphanumeric, we need to map normalized positions to original spans
        // Simpler approach: find spans whose normalized text overlaps the match
        let charCount = 0;
        let scrolledToFirst = false;
        const matchingSpans: Element[] = [];

        for (const { span } of spanMap) {
          const spanNorm = normalize(span.textContent || "");
          if (spanNorm.length === 0) continue;
          const spanEnd = charCount + spanNorm.length;
          // Check if this span's normalized text overlaps with match region
          if (spanEnd > matchIdx && charCount < matchIdx + matchLen) {
            matchingSpans.push(span);
          }
          charCount = spanEnd + 1; // +1 for the space between spans
        }

        // Highlight matching spans — Leasecake-style teal/green background on text
        const layerRect = textLayer.getBoundingClientRect();
        for (const span of matchingSpans) {
          const rect = span.getBoundingClientRect();
          const highlight = document.createElement("div");
          highlight.className = "source-highlight";
          highlight.style.cssText = `
            position: absolute;
            left: ${rect.left - layerRect.left - 2}px;
            top: ${rect.top - layerRect.top - 1}px;
            width: ${rect.width + 4}px;
            height: ${rect.height + 2}px;
            background: rgba(16, 185, 129, 0.25);
            pointer-events: none;
            z-index: 5;
          `;
          textLayer.appendChild(highlight);

          if (!scrolledToFirst) {
            scrolledToFirst = true;
            const container = containerRef.current;
            if (container) {
              const spanRect = span.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              const scrollTop = container.scrollTop + (spanRect.top - containerRect.top) - containerRect.height / 2;
              container.scrollTo({ top: scrollTop, behavior: "smooth" });
            }
          }
        }
      };
      const timer = setTimeout(tryHighlight, 600);

      return () => clearTimeout(timer);
    }, [activeQuote, pageNumber, highlightTrigger, ocrPages]);

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
