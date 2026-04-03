"use client";
export default function ErrorPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-sm text-muted-foreground">Something went wrong loading this page.</p>
      <button onClick={() => window.location.reload()} className="text-sm text-foreground underline">Reload</button>
    </div>
  );
}
