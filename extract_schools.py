#!/usr/bin/env python3
"""
Extract school directory records from the Overseas Joint Admissions PDF.

Input:  海外聯合招生委員會 僑生來臺就讀大學校院學士班.pdf
Output: dataset/schools_raw.csv, dataset/schools.json

Dependency:
    pip install pymupdf
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF

URL_RE = re.compile(r"https?://\S+")
RECORD_START_RE = re.compile(r"^(\d{1,3})(?:\s+(.+))?$")
POSTAL_RE = re.compile(r"^(\d{6})\s*(.*)$")
CITY_RE = re.compile(r"\d{6}\s*(?:臺灣)?(?P<city>[\u4e00-\u9fff]{2,6}[市縣])")

SKIP_LINES = {
    "編號 學校名稱",
    "聯絡電話",
    "學校地址(含郵遞區號)",
    "學校官方網站",
    "學大學",  # PDF extraction artifact on page 51
}

REGION_BY_CITY = {
    # North
    "臺北市": "north", "台北市": "north", "新北市": "north", "基隆市": "north",
    "桃園市": "north", "新竹市": "north", "新竹縣": "north", "宜蘭縣": "north",
    # Central
    "苗栗縣": "central", "臺中市": "central", "台中市": "central", "彰化縣": "central",
    "南投縣": "central", "雲林縣": "central",
    # South
    "嘉義市": "south", "嘉義縣": "south", "臺南市": "south", "台南市": "south",
    "高雄市": "south", "屏東縣": "south",
    # East
    "花蓮縣": "east", "臺東縣": "east", "台東縣": "east",
    # Islands
    "澎湖縣": "islands", "金門縣": "islands", "連江縣": "islands",
}


def normalize_space(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def make_id(name_zh: str, source_id: int) -> str:
    # Stable simple id. You can replace this later with official English abbreviations.
    compact = re.sub(r"[^\w\u4e00-\u9fff]+", "", name_zh.lower())
    return f"school_{source_id:03d}_{compact[:12]}"


def infer_categories(name: str) -> list[str]:
    categories: list[str] = []

    if name.startswith("國立") or name.startswith("臺北市立") or name.startswith("台北市立") or name.startswith("市立"):
        categories.append("public")
    else:
        categories.append("private_or_other")

    if "科技大學" in name or "技術學院" in name:
        categories.append("technology")
    elif "大學" in name or "學院" in name or "僑生先修部" in name:
        categories.append("general_or_specialized_university")

    if "醫" in name or "藥" in name or "護理" in name or "健康" in name:
        categories.append("medical_health")
    if "藝術" in name or "影藝" in name or "戲曲" in name:
        categories.append("arts")
    if "體育" in name or "運動" in name:
        categories.append("sports")
    if "師範" in name or "教育" in name or "僑生先修" in name:
        categories.append("education")
    if "餐旅" in name:
        categories.append("hospitality")
    if "商業" in name or "管理" in name or "金融" in name:
        categories.append("business_management")

    # preserve order and remove duplicates
    return list(dict.fromkeys(categories))


def extract_appendix_lines(pdf_path: Path) -> list[tuple[int, str]]:
    doc = fitz.open(pdf_path)
    lines: list[tuple[int, str]] = []

    # Find appendix pages dynamically. In this PDF, appendix 4 spans pages containing this header.
    for page_index in range(len(doc)):
        text = doc[page_index].get_text("text")
        if "附錄四" not in text or "學校通訊錄" not in text:
            continue

        for raw_line in text.splitlines():
            line = normalize_space(raw_line)
            if not line:
                continue
            if line in SKIP_LINES:
                continue
            if line.startswith("附錄四") or re.match(r"^一般\s*-\d+-", line):
                continue
            lines.append((page_index + 1, line))

    return lines


def split_record_blocks(lines: list[tuple[int, str]]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for page, line in lines:
        m = RECORD_START_RE.match(line)
        if m:
            num = int(m.group(1))
            # Only accept records in expected range to avoid accidental numeric lines.
            if 1 <= num <= 200:
                if current:
                    blocks.append(current)
                current = {"source_id": num, "pages": [page], "lines": []}
                if m.group(2):
                    current["lines"].append(m.group(2).strip())
                continue

        if current:
            current["lines"].append(line)
            if page not in current["pages"]:
                current["pages"].append(page)

    if current:
        blocks.append(current)

    return blocks


def parse_block(block: dict[str, Any], source_document: str) -> dict[str, Any]:
    source_id = block["source_id"]
    lines = list(block["lines"])

    # Extract URLs wherever they appear; remove them from the line so address parsing still works.
    urls: list[str] = []
    cleaned: list[str] = []
    for line in lines:
        found = URL_RE.findall(line)
        urls.extend(found)
        line_without_url = URL_RE.sub("", line).strip()
        if line_without_url:
            cleaned.append(line_without_url)

    phone_start = next((i for i, line in enumerate(cleaned) if "886-" in line), None)
    if phone_start is None:
        name_lines = cleaned
        phone_lines: list[str] = []
        address_lines: list[str] = []
    else:
        name_lines = cleaned[:phone_start]
        address_start = next(
            (i for i in range(phone_start + 1, len(cleaned)) if POSTAL_RE.match(cleaned[i])),
            len(cleaned),
        )
        phone_lines = cleaned[phone_start:address_start]
        address_lines = cleaned[address_start:]

    name_zh = normalize_space("".join(name_lines))
    phone = normalize_space("; ".join(phone_lines)) or None
    address_raw = normalize_space(" ".join(address_lines))
    website = urls[0] if urls else None

    postal_code = None
    city_or_county = None
    district = None

    pm = POSTAL_RE.match(address_raw)
    if pm:
        postal_code = pm.group(1)

    cm = CITY_RE.search(address_raw)
    if cm:
        city_or_county = cm.group("city")
        # Normalize common variants for region mapping but keep original visible string.
        city_norm = city_or_county.replace("台", "臺")
        region = REGION_BY_CITY.get(city_or_county) or REGION_BY_CITY.get(city_norm)
    else:
        region = None

    # District is best-effort only.
    if city_or_county:
        after_city = address_raw.split(city_or_county, 1)[-1]
        dm = re.match(r"(?P<district>[\u4e00-\u9fff]{1,5}[區鄉鎮市])", after_city)
        if dm:
            district = dm.group("district")

    now = datetime.now(timezone.utc).isoformat()

    return {
        "id": make_id(name_zh, source_id),
        "source_id": source_id,
        "name_zh": name_zh,
        "name_en": None,
        "phone": phone,
        "address_raw": address_raw,
        "postal_code": postal_code,
        "city_or_county": city_or_county,
        "district": district,
        "region": region,
        "website": website,
        "school_category": infer_categories(name_zh),
        "tags": [t for t in [city_or_county, region, *infer_categories(name_zh)] if t],
        "source": {
            "document": source_document,
            "section": "附錄四 115學年度海外聯合招生委員學校通訊錄",
            "pdf_pages": block.get("pages", []),
            "source_type": "pdf",
        },
        "created_at": now,
        "updated_at": now,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path, help="Path to the PDF file")
    parser.add_argument("--out-dir", type=Path, default=Path("dataset"), help="Output directory")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    lines = extract_appendix_lines(args.pdf)
    blocks = split_record_blocks(lines)
    schools = [parse_block(block, args.pdf.name) for block in blocks]
    schools = sorted(schools, key=lambda x: x["source_id"])

    json_path = args.out_dir / "schools.json"
    csv_path = args.out_dir / "schools_raw.csv"

    json_path.write_text(json.dumps(schools, ensure_ascii=False, indent=2), encoding="utf-8")

    fields = [
        "source_id", "id", "name_zh", "phone", "address_raw", "postal_code",
        "city_or_county", "district", "region", "website", "school_category"
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for school in schools:
            row = {k: school.get(k) for k in fields}
            row["school_category"] = ";".join(school.get("school_category", []))
            writer.writerow(row)

    print(f"Extracted {len(schools)} schools")
    print(f"JSON: {json_path}")
    print(f"CSV : {csv_path}")

    if len(schools) != 130:
        print("WARNING: Expected 130 records based on this PDF's appendix; please inspect output.")


if __name__ == "__main__":
    main()
