import argparse
import json
import re
import sqlite3
from typing import Any, Dict, Iterable, List, Optional

_HTML_TAG_RE = re.compile(r"<[^>]+>")


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


def extract_shop_data(json_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    从原始 JSON 数据中提取店铺信息。

    - 使用原始字段 `id` 作为唯一键，并重命名为 `gaode_id`
    - SQLite 中另外提供自增主键 `id`
    """
    try:
        poi_list = json_data.get("data", {}).get("poi_list", [])
    except AttributeError:
        print("错误：JSON结构不符合预期")
        return []

    if not isinstance(poi_list, list):
        print("错误：poi_list 不是 list")
        return []

    extracted: List[Dict[str, Any]] = []
    for poi in poi_list:
        gaode_id = poi.get("id")
        if not gaode_id:
            continue

        shop: Dict[str, Any] = {
            "gaode_id": str(gaode_id),
            "name": poi.get("name") or "未知店铺",
            "address": poi.get("address") or "未知地址",
            "latitude": _to_float(poi.get("latitude")),
            "longitude": _to_float(poi.get("longitude")),
            "rating": _to_float(poi.get("rating")),
            "review_total": _to_int(poi.get("review_total")),
            "avg_price": None,
            "tag": "其他",
            "deepinfo": "其他",
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
                if value_text:
                    shop["tag"] = value_text
            elif name == "deepinfo":
                if value_text:
                    shop["deepinfo"] = value_text
            elif name == "pic_info":
                raw_value = domain.get("value")
                if raw_value:
                    shop["logo"] = str(raw_value).strip()

        extracted.append(shop)

    return extracted


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, col_type: str) -> None:
    cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table});").fetchall()}
    if column in cols:
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type};")


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS shops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gaode_id TEXT NOT NULL UNIQUE,
            name TEXT,
            address TEXT,
            latitude REAL,
            longitude REAL,
            rating REAL,
            review_total INTEGER,
            avg_price INTEGER,
            tag TEXT,
            deepinfo TEXT,
            logo TEXT
        );
        """
    )
    _ensure_column(conn, "shops", "logo", "TEXT")


def upsert_shops(conn: sqlite3.Connection, shops: Iterable[Dict[str, Any]]) -> int:
    rows = [
        (
            shop.get("gaode_id"),
            shop.get("name"),
            shop.get("address"),
            shop.get("latitude"),
            shop.get("longitude"),
            shop.get("rating"),
            shop.get("review_total"),
            shop.get("avg_price"),
            shop.get("tag"),
            shop.get("deepinfo"),
            shop.get("logo"),
        )
        for shop in shops
        if shop.get("gaode_id")
    ]
    if not rows:
        return 0

    conn.executemany(
        """
        INSERT INTO shops (
            gaode_id, name, address, latitude, longitude, rating, review_total, avg_price, tag, deepinfo, logo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gaode_id) DO UPDATE SET
            name=excluded.name,
            address=excluded.address,
            latitude=excluded.latitude,
            longitude=excluded.longitude,
            rating=excluded.rating,
            review_total=excluded.review_total,
            avg_price=excluded.avg_price,
            tag=excluded.tag,
            deepinfo=excluded.deepinfo,
            logo=excluded.logo;
        """,
        rows,
    )
    return len(rows)


def save_to_sqlite(shops: List[Dict[str, Any]], db_path: str) -> int:
    conn = sqlite3.connect(db_path)
    try:
        _init_db(conn)
        with conn:
            return upsert_shops(conn, shops)
    finally:
        conn.close()


def _write_json(shops: List[Dict[str, Any]], output_file: str) -> None:
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(shops, f, ensure_ascii=False, indent=4)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract shops from JSON and save to SQLite/JSON.")
    parser.add_argument("--input", default="source.json", help="Input JSON file (default: source.json)")
    parser.add_argument("--db", default="shops.sqlite3", help="SQLite db path (default: shops.sqlite3)")
    parser.add_argument("--json-out", default=None, help="Optional JSON output path (e.g. extracted_shops.json)")
    args = parser.parse_args()

    try:
        with open(args.input, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"找不到文件: {args.input}，请确保该文件在当前目录下。")
        return

    shops = extract_shop_data(data)
    upserted = save_to_sqlite(shops, args.db)
    print(f"成功处理 {len(shops)} 条数据；写入/更新 {upserted} 条至 {args.db}")

    if args.json_out:
        _write_json(shops, args.json_out)
        print(f"同时已导出 JSON: {args.json_out}")

    print("\n--- 数据预览 (前2条) ---")
    print(json.dumps(shops[:2], ensure_ascii=False, indent=4))


if __name__ == "__main__":
    main()
