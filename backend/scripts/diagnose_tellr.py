#!/usr/bin/env python3
"""diagnose_tellr.py — figure out *why* Tellr is returning 401.

Three modes:

  1. health    : GET /api/tellr/health on a deployed RevIntel backend.
                 Tells you which pattern the running app detected and which
                 auth signals are present. This is the first thing to run
                 when you see a 401 from the browser.

  2. probe     : Probe Tellr directly (bypassing the backend) using the
                 same auth pattern the app would use. Prints the exact
                 headers sent and the raw response. Useful when you need
                 to know whether the 401 is coming from Tellr itself or
                 from somewhere in our stack.

  3. mint-sp   : Mint a service-principal token via OIDC client_credentials
                 and print the result. Validates Pattern C config without
                 going anywhere near Tellr.

Examples
--------
  # Is the deployed backend healthy?
  python diagnose_tellr.py health \\
      --backend https://revintel-backend.app.databricksapps.com

  # Probe Tellr directly using whatever pattern current env vars dictate
  TELLR_BASE_URL=https://tellr.app.databricksapps.com \\
  TELLR_SP_CLIENT_ID=... TELLR_SP_CLIENT_SECRET=... \\
  python diagnose_tellr.py probe

  # Try a Pattern A probe (simulate Apps proxy injecting forwarded-email)
  TELLR_BASE_URL=https://tellr.app.databricksapps.com \\
  python diagnose_tellr.py probe --as-pattern A --forwarded-email me@co.com

  # Just check whether the SP creds can mint a token
  TELLR_WORKSPACE_HOST=https://workspace.cloud.databricks.com \\
  TELLR_SP_CLIENT_ID=... TELLR_SP_CLIENT_SECRET=... \\
  python diagnose_tellr.py mint-sp

This script depends only on `httpx` and the standard library, so it runs
fine inside the deployed Databricks App's terminal.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
from typing import Optional

import httpx


def _redact(value: Optional[str], keep: int = 8) -> str:
    if not value:
        return "(unset)"
    if len(value) <= keep * 2:
        return "***"
    return f"{value[:keep]}...{value[-keep:]}"


def _print_header(title: str) -> None:
    print()
    print("=" * 72)
    print(f"  {title}")
    print("=" * 72)


# ---------------------------------------------------------------------------
# Mode 1: health
# ---------------------------------------------------------------------------

async def cmd_health(args: argparse.Namespace) -> int:
    url = args.backend.rstrip("/") + "/api/tellr/health"
    _print_header(f"GET {url}")
    headers: dict[str, str] = {}
    if args.forwarded_email:
        headers["x-forwarded-email"] = args.forwarded_email
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=15.0)
    print(f"status: {resp.status_code}")
    try:
        body = resp.json()
        print(json.dumps(body, indent=2))
        if resp.status_code == 200:
            pattern = body.get("pattern")
            print()
            print(f"Detected Tellr pattern: {pattern}")
            if pattern == "A" and not body.get("forwarded_email_present"):
                print("  WARNING: Pattern A but no forwarded-email — call will be 503'd by _ensure_configured")
            if pattern == "B" and not body.get("bearer_token_present"):
                print("  WARNING: Pattern B but no bearer token — call will be 503'd by _ensure_configured")
            if pattern == "C" and not body.get("sp_cache_present"):
                print("  WARNING: Pattern C but SP cache absent — likely missing TELLR_WORKSPACE_HOST")
        return 0 if resp.status_code == 200 else 1
    except json.JSONDecodeError:
        print(resp.text)
        return 1


# ---------------------------------------------------------------------------
# Mode 2: probe
# ---------------------------------------------------------------------------

def _build_probe_headers(pattern: str, base: str, forwarded_email: Optional[str], bearer: Optional[str]) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if pattern == "A":
        # The Apps proxy normally injects this; sending it ourselves only works
        # in narrow probe scenarios. Print it so we know what we did.
        if forwarded_email:
            headers["x-forwarded-email"] = forwarded_email
    elif pattern in {"B", "C"} and bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    return headers


async def _mint_sp_token(workspace_host: str, client_id: str, client_secret: str) -> str:
    url = workspace_host.rstrip("/") + "/oidc/v1/token"
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials", "scope": "all-apis"},
            timeout=30.0,
        )
    if resp.status_code != 200:
        raise RuntimeError(f"OIDC mint failed: {resp.status_code} {resp.text[:300]}")
    payload = resp.json()
    tok = payload.get("access_token")
    if not tok:
        raise RuntimeError(f"OIDC response missing access_token: {payload}")
    return tok


async def cmd_probe(args: argparse.Namespace) -> int:
    base = args.tellr_base or os.environ.get("TELLR_BASE_URL", "")
    if not base:
        print("ERROR: --tellr-base or TELLR_BASE_URL must be set", file=sys.stderr)
        return 2

    # Decide which pattern to probe with
    pattern = args.as_pattern
    if not pattern:
        if args.forwarded_email:
            pattern = "A"
        elif os.environ.get("TELLR_SP_CLIENT_ID") and os.environ.get("TELLR_SP_CLIENT_SECRET"):
            pattern = "C"
        else:
            pattern = "B"

    bearer: Optional[str] = None
    if pattern == "C":
        cid = os.environ.get("TELLR_SP_CLIENT_ID", "")
        secret = os.environ.get("TELLR_SP_CLIENT_SECRET", "")
        host = os.environ.get("TELLR_WORKSPACE_HOST") or base
        if not (cid and secret):
            print("ERROR: Pattern C requires TELLR_SP_CLIENT_ID and TELLR_SP_CLIENT_SECRET", file=sys.stderr)
            return 2
        try:
            bearer = await _mint_sp_token(host, cid, secret)
        except RuntimeError as e:
            print(f"ERROR: SP mint failed — {e}", file=sys.stderr)
            return 3
    elif pattern == "B":
        bearer = (
            os.environ.get("DATABRICKS_OAUTH_TOKEN")
            or os.environ.get("TELLR_OAUTH_TOKEN")
            or args.bearer
        )
        if not bearer:
            print("ERROR: Pattern B requires DATABRICKS_OAUTH_TOKEN/TELLR_OAUTH_TOKEN/--bearer", file=sys.stderr)
            return 2

    mcp_url = base.rstrip("/") + "/mcp/"
    headers = _build_probe_headers(pattern, base, args.forwarded_email, bearer)
    body = {"jsonrpc": "2.0", "id": 1, "method": "ping"}

    _print_header(f"POST {mcp_url}  (pattern={pattern})")
    print("Outbound headers:")
    for k, v in headers.items():
        if k.lower() == "authorization":
            print(f"  {k}: Bearer {_redact(v.split(' ', 1)[-1])}")
        else:
            print(f"  {k}: {v}")
    print(f"Body: {json.dumps(body)}")
    print()

    async with httpx.AsyncClient() as client:
        resp = await client.post(mcp_url, json=body, headers=headers, timeout=30.0)

    print(f"Response status: {resp.status_code}")
    print("Response headers:")
    for k, v in resp.headers.items():
        print(f"  {k}: {v}")
    print()
    print("Response body (first 2KB):")
    print(resp.text[:2048])

    if resp.status_code == 401:
        print()
        print("--- Diagnosis ---")
        if pattern == "A":
            print("Pattern A 401 usually means:")
            print("  * The deploying app is NOT in the same workspace as Tellr (proxy didn't inject identity)")
            print("  * The forwarded user is not a Tellr workspace member with 'Can use' on the app")
        elif pattern == "B":
            print("Pattern B 401 usually means:")
            print("  * The bearer is a PAT (dapi…) — Apps MCP rejects PATs; mint an OAuth U2M token")
            print("  * The OAuth U2M token has expired (~1h lifetime)")
        else:
            print("Pattern C 401 usually means:")
            print("  * The SP is not a Tellr workspace member, OR doesn't have 'Can use' on the Tellr app")
            print("  * Wrong workspace host (ensure TELLR_WORKSPACE_HOST matches the SP's workspace)")
    return 0 if resp.status_code < 400 else 1


# ---------------------------------------------------------------------------
# Mode 3: mint-sp
# ---------------------------------------------------------------------------

async def cmd_mint_sp(args: argparse.Namespace) -> int:
    host = args.workspace_host or os.environ.get("TELLR_WORKSPACE_HOST") or os.environ.get("TELLR_BASE_URL")
    cid = args.client_id or os.environ.get("TELLR_SP_CLIENT_ID")
    secret = args.client_secret or os.environ.get("TELLR_SP_CLIENT_SECRET")
    if not (host and cid and secret):
        print("ERROR: workspace host + client id + client secret required (CLI flags or env vars)", file=sys.stderr)
        return 2

    _print_header(f"POST {host.rstrip('/')}/oidc/v1/token")
    print(f"client_id:     {cid}")
    print(f"client_secret: {_redact(secret)}")
    print(f"grant_type:    client_credentials")
    print(f"scope:         all-apis")
    try:
        tok = await _mint_sp_token(host, cid, secret)
    except RuntimeError as e:
        print(f"\nFAIL: {e}", file=sys.stderr)
        return 3
    print()
    print(f"OK — minted access_token: {_redact(tok)}")
    return 0


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Diagnose Tellr 401s from a deployed or local RevIntel backend")
    sub = p.add_subparsers(dest="cmd", required=True)

    health = sub.add_parser("health", help="Hit /api/tellr/health on a deployed backend")
    health.add_argument("--backend", required=True, help="Backend base URL, e.g. https://revintel-backend.app.databricksapps.com")
    health.add_argument("--forwarded-email", help="Send an x-forwarded-email header (probe Pattern A)")

    probe = sub.add_parser("probe", help="Probe Tellr directly with the chosen pattern")
    probe.add_argument("--tellr-base", help="Tellr base URL (default: $TELLR_BASE_URL)")
    probe.add_argument("--as-pattern", choices=["A", "B", "C"], help="Force a specific pattern (default: auto-detect from env)")
    probe.add_argument("--forwarded-email", help="x-forwarded-email value for Pattern A probes")
    probe.add_argument("--bearer", help="Override bearer token for Pattern B")

    mint = sub.add_parser("mint-sp", help="Try to mint a service-principal OAuth token")
    mint.add_argument("--workspace-host", help="Workspace host (default: $TELLR_WORKSPACE_HOST or $TELLR_BASE_URL)")
    mint.add_argument("--client-id", help="SP client id (default: $TELLR_SP_CLIENT_ID)")
    mint.add_argument("--client-secret", help="SP client secret (default: $TELLR_SP_CLIENT_SECRET)")

    return p


async def _async_main(args: argparse.Namespace) -> int:
    if args.cmd == "health":
        return await cmd_health(args)
    if args.cmd == "probe":
        return await cmd_probe(args)
    if args.cmd == "mint-sp":
        return await cmd_mint_sp(args)
    return 2


def main() -> int:
    args = _parser().parse_args()
    try:
        return asyncio.run(_async_main(args))
    except KeyboardInterrupt:  # pragma: no cover
        return 130


if __name__ == "__main__":
    sys.exit(main())
