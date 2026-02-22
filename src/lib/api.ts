/**
 * GroSpace API Client
 * Communicates with the FastAPI backend (Railway) for AI operations
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

/** Classify a document type from its text */
export async function classifyDocument(text: string) {
  return apiFetch("/api/classify", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/** Extract structured data from a document */
export async function extractDocument(fileUrl: string, agreementId: string) {
  return apiFetch("/api/extract", {
    method: "POST",
    body: JSON.stringify({ file_url: fileUrl, agreement_id: agreementId }),
  });
}

/** Ask a question about a specific agreement document */
export async function askDocumentQuestion(agreementId: string, question: string) {
  return apiFetch("/api/qa", {
    method: "POST",
    body: JSON.stringify({ agreement_id: agreementId, question }),
  });
}

/** Analyze a document for risk flags */
export async function analyzeRiskFlags(agreementId: string, extractedData: Record<string, unknown>) {
  return apiFetch("/api/risk-flags", {
    method: "POST",
    body: JSON.stringify({ agreement_id: agreementId, extracted_data: extractedData }),
  });
}

/** Upload a PDF file directly and get AI extraction results */
export async function uploadAndExtract(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/upload-and-extract`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

/** Check backend health */
export async function checkHealth() {
  return apiFetch("/api/health");
}
