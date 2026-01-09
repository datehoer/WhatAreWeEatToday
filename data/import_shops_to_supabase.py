#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_SPLIT_RE = re.compile(r"[;,，\n\r\t]+")


def _strip_html(value: Any) -> str:
    if value is None:
        return ""
    return _HTML_TAG_RE.sub("", str(value)).strip()


def _to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        match = re.search(r"-?\d+", text)
        return int(match.group(0)) if match else None


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        match = re.search(r"-?\d+(?:\.\d+)?", text)
        return float(match.group(0)) if match else None


def _dedupe_preserve_order(items: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    out: List[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def _normalize_tags(raw: Any) -> str:
    if raw is None:
        return ""
    text = str(raw).strip()
    if not text or text == "其他":
        return ""
    parts = [p.strip() for p in _SPLIT_RE.split(text) if p.strip()]
    return ";".join(_dedupe_preserve_order(parts))


def _normalize_deepinfo(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        parts = [str(x).strip() for x in raw if str(x).strip()]
        return _dedupe_preserve_order(parts)
    if isinstance(raw, dict):
        parts = [f"{k}:{raw[k]}" for k in sorted(raw.keys()) if str(raw[k]).strip()]
        return _dedupe_preserve_order([str(p).strip() for p in parts if str(p).strip()])

    text = _strip_html(raw)
    if not text or text == "其他":
        return []

    if text.startswith("[") or text.startswith("{"):
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = None
        if isinstance(parsed, list):
            return _normalize_deepinfo(parsed)
        if isinstance(parsed, dict):
            return _normalize_deepinfo(parsed)

    parts = [p.strip() for p in _SPLIT_RE.split(text) if p.strip()]
    return _dedupe_preserve_order(parts)


def extract_shop_data(json_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    从高德/AMap JSON 响应中提取店铺信息（参考 data/extract_data.py）。
    """
    try:
        poi_list = json_data.get("data", {}).get("poi_list", [])
    except AttributeError:
        return []

    if not isinstance(poi_list, list):
        return []

    extracted: List[Dict[str, Any]] = []
    for poi in poi_list:
        gaode_id = poi.get("id")
        if not gaode_id:
            continue

        shop: Dict[str, Any] = {
            "gaode_id": str(gaode_id),
            "name": poi.get("name") or "未知店铺",
            "address": poi.get("address") or "",
            "latitude": _to_float(poi.get("latitude")),
            "longitude": _to_float(poi.get("longitude")),
            "rating": _to_float(poi.get("rating")) or 0,
            "review_total": _to_int(poi.get("review_total")),
            "avg_price": None,
            "tag": "",
            "deepinfo": [],
            "logo": None,
        }

        for domain in (poi.get("domain_list") or []):
            name = domain.get("name")
            value_text = _strip_html(domain.get("value", ""))

            if name == "price":
                match = re.search(r"(\d+)", value_text)
                if match:
                    shop["avg_price"] = _to_int(match.group(1))
            elif name == "tag":
                shop["tag"] = _normalize_tags(value_text)
            elif name == "deepinfo":
                shop["deepinfo"] = _normalize_deepinfo(value_text)
            elif name == "pic_info":
                raw_value = domain.get("value")
                if raw_value:
                    shop["logo"] = str(raw_value).strip()

        extracted.append(shop)

    return extracted


def _load_json_file(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _maybe_load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def _get_env_first(keys: Sequence[str]) -> str:
    for k in keys:
        v = os.getenv(k, "").strip()
        if v:
            return v
    return ""


def _build_rest_url(base_url: str, table: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/rest/v1"):
        return f"{base}/{table}"
    return f"{base}/rest/v1/{table}"


@dataclass(frozen=True)
class RestConfig:
    base_url: str
    api_key: str
    table: str = "shops"
    on_conflict: str = "gaode_id"
    timeout_s: int = 60


def _http_json(
    url: str,
    method: str,
    headers: Dict[str, str],
    body: Optional[Any],
    timeout_s: int,
) -> Tuple[int, str]:
    data: Optional[bytes] = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(url, data=data, method=method)
    for k, v in headers.items():
        req.add_header(k, v)

    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read()
            return resp.status, raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return e.code, raw


def _shop_to_supabase_row(shop: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    gaode_id = str(shop.get("gaode_id") or "").strip()
    if not gaode_id:
        return None

    lat = _to_float(shop.get("latitude"))
    lng = _to_float(shop.get("longitude"))
    if lat is None or lng is None:
        return None

    name = str(shop.get("name") or "未知店铺").strip() or "未知店铺"
    rating = _to_float(shop.get("rating"))
    avg_price = _to_float(shop.get("avg_price"))
    logo = (str(shop.get("logo")).strip() if shop.get("logo") is not None else None) or None

    tag = _normalize_tags(shop.get("tag"))
    deepinfo = _normalize_deepinfo(shop.get("deepinfo"))

    return {
        "gaode_id": gaode_id,
        "name": name,
        "location": f"SRID=4326;POINT({lng} {lat})",
        "rating": rating if rating is not None else 0,
        "avg_price": avg_price,
        "tag": tag or None,
        "logo": logo,
        "deepinfo": deepinfo,
    }


def _chunked(items: Sequence[Any], size: int) -> Iterable[Sequence[Any]]:
    if size <= 0:
        raise ValueError("batch size must be > 0")
    for i in range(0, len(items), size):
        yield items[i : i + size]


def upsert_shops_rest(cfg: RestConfig, rows: Sequence[Dict[str, Any]], batch_size: int) -> None:
    url = _build_rest_url(cfg.base_url, cfg.table)
    if cfg.on_conflict:
        url = f"{url}?on_conflict={urllib.parse.quote(cfg.on_conflict)}"

    headers = {
        "apikey": cfg.api_key,
        "Authorization": f"Bearer {cfg.api_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    total = len(rows)
    for idx, batch in enumerate(_chunked(rows, batch_size), start=1):
        started = time.time()
        status, body = _http_json(url, "POST", headers, list(batch), timeout_s=cfg.timeout_s)
        took_ms = int((time.time() - started) * 1000)

        if status not in (200, 201, 204):
            raise RuntimeError(
                f"Supabase REST upsert failed (status={status}) batch={idx} size={len(batch)}\n{body}"
            )

        print(f"✅ batch {idx}: {len(batch)}/{total} ({took_ms}ms)")


def _gather_shops_from_inputs(paths: Sequence[Path]) -> List[Dict[str, Any]]:
    all_shops: List[Dict[str, Any]] = []
    for path in paths:
        payload = _load_json_file(path)
        if isinstance(payload, list):
            all_shops.extend([x for x in payload if isinstance(x, dict)])
        elif isinstance(payload, dict):
            all_shops.extend(extract_shop_data(payload))
        else:
            continue
    return all_shops


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Parse AMap JSON and upsert into Supabase (shops table) via PostgREST."
    )
    parser.add_argument(
        "--input",
        nargs="+",
        default=["source.json"],
        help="Input JSON file(s). Accepts raw AMap response or extracted shop list JSON.",
    )
    parser.add_argument(
        "--env-file",
        default="frontend/.env.local",
        help="Optional env file to load (default: frontend/.env.local).",
    )
    parser.add_argument("--table", default="shops", help="Target table (default: shops).")
    parser.add_argument("--on-conflict", default="gaode_id", help="Upsert conflict target (default: gaode_id).")
    parser.add_argument("--batch-size", type=int, default=500, help="Rows per request (default: 500).")
    parser.add_argument("--timeout", type=int, default=60, help="HTTP timeout seconds (default: 60).")
    parser.add_argument("--max", type=int, default=0, help="Only import first N rows (0 = no limit).")
    parser.add_argument("--dry-run", action="store_true", help="Parse and preview only; do not write to Supabase.")
    args = parser.parse_args()

    _maybe_load_env_file(Path(args.env_file))

    supabase_url = _get_env_first(["SUPABASE_URL", "VITE_SUPABASE_URL"])
    api_key = _get_env_first(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY", "SUPABASE_SERVICE_KEY"])

    if not supabase_url:
        print("Missing SUPABASE_URL (or VITE_SUPABASE_URL).", file=sys.stderr)
        return 2
    if not api_key and not args.dry_run:
        print(
            "Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY). "
            "shops 表默认没有 INSERT/UPDATE RLS 策略，建议用 service role key 导入。",
            file=sys.stderr,
        )
        return 2

    input_paths = [Path(p) for p in args.input]
    missing = [str(p) for p in input_paths if not p.exists()]
    if missing:
        print(f"Input file(s) not found: {', '.join(missing)}", file=sys.stderr)
        return 2

    shops = _gather_shops_from_inputs(input_paths)
    if not shops:
        print("No shops found in input.", file=sys.stderr)
        return 1

    rows: List[Dict[str, Any]] = []
    skipped = 0
    for shop in shops:
        row = _shop_to_supabase_row(shop)
        if row is None:
            skipped += 1
            continue
        rows.append(row)

    if args.max and args.max > 0:
        rows = rows[: args.max]

    deduped: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        deduped[row["gaode_id"]] = row
    rows = list(deduped.values())

    print(f"Parsed shops: {len(shops)}")
    print(f"Valid rows: {len(rows)} (skipped: {skipped}, deduped by gaode_id)")
    print("--- preview (first 2) ---")
    print(json.dumps(rows[:2], ensure_ascii=False, indent=2))

    if args.dry_run:
        print("Dry-run: no data written.")
        return 0

    cfg = RestConfig(
        base_url=supabase_url,
        api_key=api_key,
        table=args.table,
        on_conflict=args.on_conflict,
        timeout_s=args.timeout,
    )
    upsert_shops_rest(cfg, rows, batch_size=args.batch_size)
    print("✅ Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
