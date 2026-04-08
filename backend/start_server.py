"""
Production entrypoint for Railway.

This service is memory-heavy because document extraction pulls in OCR, PDF, and AI SDKs.
On smaller Railway instances, multiple Uvicorn workers often make startup and live
responsiveness worse due to duplicated memory and worker contention.
"""

from __future__ import annotations

import os
import sys


def _int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


def main() -> None:
    port = _int_env("PORT", 8000)
    requested_workers = _int_env("WEB_CONCURRENCY", 1)
    keep_alive = _int_env("UVICORN_KEEP_ALIVE", 30)
    railway_env = os.getenv("RAILWAY_ENVIRONMENT", "").strip().lower()
    allow_multi_worker = os.getenv("ALLOW_MULTI_WORKER", "").strip().lower() in {"1", "true", "yes"}

    effective_workers = requested_workers
    if railway_env and not allow_multi_worker:
        effective_workers = 1

    cmd = [
        "uvicorn",
        "main:app",
        "--host", "0.0.0.0",
        "--port", str(port),
        "--workers", str(effective_workers),
        "--timeout-keep-alive", str(keep_alive),
    ]

    limit_concurrency = os.getenv("UVICORN_LIMIT_CONCURRENCY", "").strip()
    if limit_concurrency:
        cmd.extend(["--limit-concurrency", limit_concurrency])

    print(
        "[startup] launching backend",
        {
            "port": port,
            "requested_workers": requested_workers,
            "effective_workers": effective_workers,
            "keep_alive": keep_alive,
            "railway_env": railway_env or "local",
            "allow_multi_worker": allow_multi_worker,
            "limit_concurrency": limit_concurrency or None,
        },
        flush=True,
    )

    os.execvp(cmd[0], cmd)


if __name__ == "__main__":
    main()
