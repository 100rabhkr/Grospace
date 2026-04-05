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

// Inject highlight animation CSS once
function ensureHighlightStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("hl-pulse-css")) return;
  const s = document.createElement("style");
  s.id = "hl-pulse-css";
  s.textContent = `
    @keyframes hlPulse {
      0%,100% { box-shadow: 0 0 0 3px rgba(59,130,246,0.12), 0 0 16px rgba(59,130,246,0.10); }
      50%     { box-shadow: 0 0 0 5px rgba(59,130,246,0.18), 0 0 24px rgba(59,130,246,0.16); }
    }
    .hl-spot {
      position: absolute;
      background: rgba(59,130,246,0.12);
      border: 2.5px solid rgba(59,130,246,0.55);
      border-radius: 5px;
      pointer-events: none;
      z-index: 5;
      animation: hlPulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(s);
}

function clearAllHighlights(container: HTMLElement | null) {
  if (!container) return;
  // Clear from everywhere — page element, text layer, and container
  container.querySelectorAll(".hl-spot").forEach((el) => el.remove());
}

// Normalize text for fuzzy matching
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(
  function PdfViewer({ url, activePage, highlightQuote, ocrPages, onPageChange }, ref) {
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState(activePage || 1);
    const [scale, setScale] = useState(1.0);
    const [error, setError] = useState<string | null>(null);
    const [activeQuote, setActiveQuote] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      goToPage: (page: number) => {
        setPageNumber(Math.max(1, Math.min(page, numPages || page)));
        onPageChange?.(page);
      },
      highlightText: (quote: string, page?: number) => {
        if (page) { setPageNumber(page); onPageChange?.(page); }
        setActiveQuote(quote);
      },
      clearHighlight: () => setActiveQuote(null),
    }));

    // Navigate to external activePage
    useEffect(() => {
      if (activePage && activePage <= (numPages || activePage)) {
        setPageNumber(activePage);
      }
    }, [activePage, numPages]);

    // Sync external highlightQuote
    useEffect(() => {
      setActiveQuote(highlightQuote || null);
    }, [highlightQuote]);

    // Clear highlights when page changes (user clicks next/prev)
    useEffect(() => {
      clearAllHighlights(containerRef.current);
    }, [pageNumber]);

    // ─── Main highlight effect ──────────────────────────────────
    useEffect(() => {
      if (!activeQuote || !containerRef.current) return;
      ensureHighlightStyles();

      let attempt = 0;
      const run = () => {
        attempt++;
        const pageEl = containerRef.current?.querySelector(".react-pdf__Page") as HTMLElement | null;
        if (!pageEl) { if (attempt < 10) setTimeout(run, 300); return; }

        // Make sure correct page is rendered
        const renderedNum = pageEl.getAttribute("data-page-number");
        if (renderedNum && parseInt(renderedNum) !== pageNumber) {
          if (attempt < 10) setTimeout(run, 300);
          return;
        }

        clearAllHighlights(containerRef.current);

        const textLayer = pageEl.querySelector(".react-pdf__Page__textContent") as HTMLElement | null;
        const textSpans = textLayer ? textLayer.querySelectorAll("span") : [];
        // Check if spans have actually rendered (have non-zero dimensions)
        const firstSpanRect = textSpans.length > 0 ? textSpans[0].getBoundingClientRect() : null;
        const spansRendered = firstSpanRect && firstSpanRect.width > 0 && firstSpanRect.height > 0;

        // If text layer exists but spans not rendered yet, retry
        if (textLayer && textSpans.length > 3 && !spansRendered) {
          if (attempt < 12) setTimeout(run, 400);
          return;
        }

        const hasTextLayer = textLayer && textSpans.length > 3 && spansRendered;

        if (hasTextLayer && textLayer) {
          // ──── TEXT PDF: match spans, draw spotlight box ────
          const spans = Array.from(textLayer.querySelectorAll("span"));
          let fullText = "";
          const spanMap: { start: number; end: number; span: Element }[] = [];
          for (const span of spans) {
            const t = span.textContent || "";
            const start = fullText.length;
            fullText += t + " ";
            spanMap.push({ start, end: start + t.length, span });
          }
          const nFull = norm(fullText);
          const nQuote = norm(activeQuote);

          // Find match index — progressively shorter
          let matchIdx = -1;
          let matchLen = 0;
          for (const len of [nQuote.length, 80, 60, 40, 25, 15, 10]) {
            if (nQuote.length < len) continue;
            const idx = nFull.indexOf(nQuote.slice(0, len));
            if (idx !== -1) { matchIdx = idx; matchLen = Math.min(len, 100); break; }
          }
          // Fallback: 3 consecutive words
          if (matchIdx === -1) {
            const qw = nQuote.split(" ").filter((w) => w.length > 2);
            for (let i = 0; i <= qw.length - 3; i++) {
              const chunk = qw.slice(i, i + 3).join(" ");
              const idx = nFull.indexOf(chunk);
              if (idx !== -1) { matchIdx = idx; matchLen = chunk.length; break; }
            }
          }

          if (matchIdx === -1) return; // no match — skip

          // Collect overlapping spans
          let cc = 0;
          const hits: Element[] = [];
          for (const { span } of spanMap) {
            const sn = norm(span.textContent || "");
            if (!sn.length) continue;
            const se = cc + sn.length;
            if (se > matchIdx && cc < matchIdx + matchLen) hits.push(span);
            if (hits.length >= 10) break;
            cc = se + 1;
          }

          if (!hits.length) return;

          // Compute bounding rect — only use spans with non-zero size
          const layerRect = textLayer.getBoundingClientRect();
          let x1 = Infinity, y1 = Infinity, x2 = 0, y2 = 0;
          let validSpans = 0;
          for (const span of hits) {
            const r = span.getBoundingClientRect();
            // Skip spans that haven't rendered yet (zero size)
            if (r.width < 1 || r.height < 1) continue;
            validSpans++;
            x1 = Math.min(x1, r.left - layerRect.left);
            y1 = Math.min(y1, r.top - layerRect.top);
            x2 = Math.max(x2, r.right - layerRect.left);
            y2 = Math.max(y2, r.bottom - layerRect.top);
          }

          // If no valid spans rendered yet, retry later
          if (validSpans === 0) {
            if (attempt < 10) setTimeout(run, 400);
            return;
          }

          // Clamp height to max ~4 lines
          const lineH = hits[0].getBoundingClientRect().height || 14;
          const maxH = lineH * 5;
          if (y2 - y1 > maxH) y2 = y1 + maxH;

          // Clamp within layer
          const pad = 5;
          const left = Math.max(0, x1 - pad);
          const top = Math.max(0, y1 - pad);
          const width = Math.min(layerRect.width - left, x2 - x1 + pad * 2);
          const height = Math.min(layerRect.height - top, y2 - y1 + pad * 2);

          if (width < 5 || height < 5) return; // too small — skip

          const box = document.createElement("div");
          box.className = "hl-spot";
          box.style.left = `${left}px`;
          box.style.top = `${top}px`;
          box.style.width = `${width}px`;
          box.style.height = `${height}px`;
          textLayer.appendChild(box);

          // Scroll to it
          const c = containerRef.current;
          if (c) {
            const cr = c.getBoundingClientRect();
            c.scrollTo({ top: c.scrollTop + (y1 - cr.height / 3), behavior: "smooth" });
          }

        } else if (ocrPages && ocrPages.length > 0) {
          // ──── SCANNED PDF: bbox overlay ────
          const ocrPage = ocrPages.find((p) => p.page_number === pageNumber);
          if (!ocrPage || !ocrPage.words.length) return;

          const words = ocrPage.words;
          const wordN = words.map((w) => norm(w.text));
          const joined = wordN.join(" ");
          const nQuote = norm(activeQuote);

          let startIdx = -1;
          for (const len of [nQuote.length, 60, 40, 25, 15, 10]) {
            if (nQuote.length < len) continue;
            const idx = joined.indexOf(nQuote.slice(0, len));
            if (idx !== -1) {
              let cp = 0;
              startIdx = wordN.findIndex((wt) => { const s = cp; cp += wt.length + 1; return s <= idx && idx < cp; });
              break;
            }
          }
          if (startIdx === -1) return;

          const pageRect = pageEl.getBoundingClientRect();
          const rW = pageRect.width;
          const rH = pageRect.height;

          // Cluster: max 4 lines from first word
          const first = words[startIdx];
          const maxYLimit = first.bbox.y + first.bbox.h * 4;
          let endIdx = startIdx;
          for (let i = startIdx; i < Math.min(startIdx + 20, words.length); i++) {
            if (words[i].bbox.y > maxYLimit) break;
            endIdx = i + 1;
          }

          let bx1 = Infinity, by1 = Infinity, bx2 = 0, by2 = 0;
          for (let i = startIdx; i < endIdx; i++) {
            const w = words[i];
            bx1 = Math.min(bx1, w.bbox.x);
            by1 = Math.min(by1, w.bbox.y);
            bx2 = Math.max(bx2, w.bbox.x + w.bbox.w);
            by2 = Math.max(by2, w.bbox.y + w.bbox.h);
          }

          const p = 0.005;
          bx1 = Math.max(0, bx1 - p);
          by1 = Math.max(0, by1 - p);
          bx2 = Math.min(1, bx2 + p);
          by2 = Math.min(1, by2 + p);

          const box = document.createElement("div");
          box.className = "hl-spot";
          box.style.left = `${bx1 * rW}px`;
          box.style.top = `${by1 * rH}px`;
          box.style.width = `${(bx2 - bx1) * rW}px`;
          box.style.height = `${(by2 - by1) * rH}px`;
          pageEl.appendChild(box);

          const c = containerRef.current;
          if (c) c.scrollTo({ top: c.scrollTop + by1 * rH - pageRect.height / 3, behavior: "smooth" });
        }
      };

      const timer = setTimeout(run, 1000);
      return () => clearTimeout(timer);
    }, [activeQuote, pageNumber, ocrPages]);

    const onDocumentLoadSuccess = useCallback(
      ({ numPages: n }: { numPages: number }) => {
        setNumPages(n);
        if (!activePage) setPageNumber(1);
        setError(null);
      },
      [activePage]
    );

    const onDocumentLoadError = useCallback(() => setError("Failed to load PDF document"), []);

    const goToPrev = () => { const p = Math.max(1, pageNumber - 1); setPageNumber(p); setActiveQuote(null); onPageChange?.(p); };
    const goToNext = () => { const p = Math.min(numPages, pageNumber + 1); setPageNumber(p); setActiveQuote(null); onPageChange?.(p); };

    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={pageNumber <= 1} onClick={goToPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums min-w-[80px] text-center">
              {numPages > 0 ? `Page ${pageNumber} of ${numPages}` : "Loading..."}
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={pageNumber >= numPages} onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {activeQuote && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-600"
                onClick={() => { setActiveQuote(null); clearAllHighlights(containerRef.current); }}>
                <FileText className="h-3 w-3 mr-1" />Clear
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={scale <= 0.5}
              onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={scale >= 2.5}
              onClick={() => setScale((s) => Math.min(2.5, s + 0.25))}>
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
              <Button variant="outline" size="sm" onClick={() => { setError(null); setPageNumber(1); }}>Retry</Button>
            </div>
          ) : (
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center gap-2 text-neutral-500">
                  <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading PDF...</span>
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
                    <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Rendering page...</span>
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
