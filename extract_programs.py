#!/usr/bin/env python3
"""
Extract program / department entries from the Overseas Joint Admissions Committee PDF.

Output is separated by application system:
- personal_application_standard
- personal_application_ifp
- joint_distribution_group1
- joint_distribution_group2
- joint_distribution_group3

Every program row links back to dataset/schools.json through school_id and school_source_id.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import fitz  # PyMuPDF

# The previous schools.json extraction left source_id 60 blank because the school name was split in the PDF table.
MANUAL_SCHOOL_FIXES = {
    60: "馬偕學校財團法人馬偕醫學大學",
}

SECTION_CONFIG = {
    "programs_personal_application_standard": {
        "pages": list(range(16, 36)),
        "kind": "personal",
        "application_system": "personal_application_standard",
        "admission_track": "personal_application",
        "admission_group": None,
        "source_section": "附錄二之一 個人申請制招生校系名稱",
        "is_ifp": False,
    },
    "programs_personal_application_ifp": {
        "pages": [37],
        "kind": "personal",
        "application_system": "personal_application_ifp",
        "admission_track": "personal_application",
        "admission_group": None,
        "source_section": "附錄二之一 個人申請制【國際專修部】招生校系名稱",
        "is_ifp": True,
    },
    "programs_joint_distribution_group1": {
        "pages": list(range(39, 51)),
        "kind": "joint",
        "application_system": "joint_distribution",
        "admission_track": "joint_distribution",
        "admission_group": "第一類組",
        "group_code": "group1",
        "source_section": "附錄二之二 聯合分發制招生校系名稱及代碼表：第一類組",
        "is_ifp": False,
    },
    "programs_joint_distribution_group2": {
        "pages": list(range(51, 57)),
        "kind": "joint",
        "application_system": "joint_distribution",
        "admission_track": "joint_distribution",
        "admission_group": "第二類組",
        "group_code": "group2",
        "source_section": "附錄二之二 聯合分發制招生校系名稱及代碼表：第二類組",
        "is_ifp": False,
    },
    "programs_joint_distribution_group3": {
        "pages": list(range(57, 60)),
        "kind": "joint",
        "application_system": "joint_distribution",
        "admission_track": "joint_distribution",
        "admission_group": "第三類組",
        "group_code": "group3",
        "source_section": "附錄二之二 聯合分發制招生校系名稱及代碼表：第三類組",
        "is_ifp": False,
    },
}

CSV_FIELDS = [
    "program_id",
    "application_system",
    "admission_track",
    "admission_group",
    "choice_code",
    "school_id",
    "school_source_id",
    "school_name_zh",
    "department_name_zh",
    "department_name_clean_zh",
    "is_key_industry_program",
    "is_international_foundation_program",
    "source_pdf_page",
    "source_section",
    "notes",
]


def normalize_text(s: Optional[str]) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    replacements = {
        "聯": "聯", "來": "來", "讀": "讀", "兩": "兩", "年": "年", "行": "行",
        "類": "類", "不": "不", "理": "理", "度": "度", "錄": "錄", "歷": "歷",
        "金": "金", "力": "力", "論": "論", "了": "了", "福": "福", "老": "老",
        "參": "參", "精": "精", "更": "更", "連": "連", "留": "留", "旅": "旅",
        "見": "見", "例": "例", "車": "車", "冷": "冷", "若": "若", "識": "識",
    }
    for k, v in replacements.items():
        s = s.replace(k, v)
    return re.sub(r"\s+", "", s)


def compact(s: Optional[str]) -> str:
    """Keep readable text but remove PDF line-break whitespace."""
    return normalize_text(s)


def clean_key_industry_name(name: str) -> str:
    return (
        name.replace("(重點產業系所)", "")
        .replace("（重點產業系所）", "")
        .replace("【重點產業系所】", "")
        .strip()
    )


def load_school_index(schools_path: Path) -> Tuple[List[dict], Dict[str, dict]]:
    schools = json.loads(schools_path.read_text(encoding="utf-8"))
    for school in schools:
        sid = school.get("source_id")
        if sid in MANUAL_SCHOOL_FIXES:
            school["name_zh"] = MANUAL_SCHOOL_FIXES[sid]
            if not school.get("id") or school.get("id", "").endswith("_"):
                school["id"] = f"school_{int(sid):03d}_{MANUAL_SCHOOL_FIXES[sid]}"
    by_norm = {normalize_text(s.get("name_zh")): s for s in schools if normalize_text(s.get("name_zh"))}
    return schools, by_norm


def extract_table_rows(doc: fitz.Document, pages: Iterable[int], kind: str) -> List[dict]:
    rows: List[dict] = []
    for page_num in pages:
        page = doc[page_num - 1]
        tables = sorted(page.find_tables().tables, key=lambda t: t.bbox[0])
        for table in tables:
            data = table.extract()
            if not data:
                continue
            # Skip header row.
            for raw in data[1:]:
                if kind == "personal":
                    if len(raw) < 2:
                        continue
                    rows.append({
                        "source_pdf_page": page_num,
                        "choice_code": None,
                        "school_raw": raw[0] or "",
                        "department_raw": raw[1] or "",
                    })
                else:
                    if len(raw) < 3:
                        continue
                    rows.append({
                        "source_pdf_page": page_num,
                        "choice_code": compact(raw[0] or ""),
                        "school_raw": raw[1] or "",
                        "department_raw": raw[2] or "",
                    })
    return rows


def make_record(
    *,
    program_id: str,
    application_system: str,
    admission_track: str,
    admission_group: Optional[str],
    choice_code: Optional[str],
    school: dict,
    department: str,
    source_pdf_page: int,
    source_section: str,
    is_ifp: bool,
) -> dict:
    return {
        "program_id": program_id,
        "application_system": application_system,
        "admission_track": admission_track,
        "admission_group": admission_group,
        "choice_code": choice_code,
        "school_id": school.get("id"),
        "school_source_id": school.get("source_id"),
        "school_name_zh": school.get("name_zh"),
        "department_name_zh": department,
        "department_name_clean_zh": clean_key_industry_name(department),
        "is_key_industry_program": "重點產業系所" in department,
        "is_international_foundation_program": is_ifp,
        "source_pdf_page": source_pdf_page,
        "source_section": source_section,
        "notes": None,
    }


def resolve_table_rows(raw_rows: List[dict], school_by_norm: Dict[str, dict], config: dict) -> Tuple[List[dict], List[dict]]:
    records: List[dict] = []
    unmatched: List[dict] = []
    pending_record: Optional[dict] = None
    skip_next = False
    seq = 1

    for i, row in enumerate(raw_rows):
        if skip_next:
            skip_next = False
            continue

        code = compact(row.get("choice_code")) if row.get("choice_code") else None
        school_raw = row.get("school_raw") or ""
        dept_raw = row.get("department_raw") or ""
        school_key = normalize_text(school_raw)
        dept = compact(dept_raw)

        # Skip category/header artifacts from PDF tables.
        if school_key in {"校名", "大學", "技術學院", ""} and dept in {"系名", ""}:
            continue
        if config["kind"] == "joint" and code and not re.fullmatch(r"\d{4}", code):
            continue

        # Department continuation row, e.g. blank school/code with '(重點產業系所)' or wrapped department text.
        if not school_key and dept and pending_record is not None:
            pending_record["department_name_zh"] += dept
            pending_record["department_name_clean_zh"] = clean_key_industry_name(pending_record["department_name_zh"])
            pending_record["is_key_industry_program"] = "重點產業系所" in pending_record["department_name_zh"]
            continue

        school = school_by_norm.get(school_key)

        # Some PDF rows split a school name across adjacent rows at the column boundary.
        # Example: source_id 118 or 60 can appear as ['...醫', '護理系'] followed by ['事科技大學', ''].
        if school is None and i + 1 < len(raw_rows):
            next_row = raw_rows[i + 1]
            next_school = next_row.get("school_raw") or ""
            next_dept = compact(next_row.get("department_raw") or "")
            next_code = compact(next_row.get("choice_code") or "")
            combined_key = normalize_text(school_raw + next_school)
            if combined_key in school_by_norm and not next_dept and not next_code:
                school = school_by_norm[combined_key]
                skip_next = True

        if school is None:
            # If a table cell has only a trailing fragment and no department, skip it quietly.
            if not dept:
                continue
            unmatched.append(row)
            continue

        if not dept:
            continue

        if config["application_system"] == "joint_distribution":
            group_code = config.get("group_code", "group")
            program_id = f"joint_{group_code}_{code}"
        else:
            program_id = f"{config['application_system']}_{seq:04d}"
            seq += 1

        record = make_record(
            program_id=program_id,
            application_system=config["application_system"],
            admission_track=config["admission_track"],
            admission_group=config.get("admission_group"),
            choice_code=code,
            school=school,
            department=dept,
            source_pdf_page=row["source_pdf_page"],
            source_section=config["source_section"],
            is_ifp=config["is_ifp"],
        )
        records.append(record)
        pending_record = record

    return records, unmatched


def write_csv(path: Path, rows: List[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k) for k in CSV_FIELDS})


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def build_schools_enriched(schools: List[dict], all_programs: List[dict]) -> List[dict]:
    grouped = defaultdict(list)
    for program in all_programs:
        grouped[program["school_id"]].append(program)

    enriched = []
    for school in schools:
        programs = grouped.get(school.get("id"), [])
        enriched.append({
            **school,
            "program_count_total": len(programs),
            "program_count_by_application_system": dict(Counter(p["application_system"] for p in programs)),
            "program_count_by_joint_group": dict(Counter(p["admission_group"] for p in programs if p.get("admission_group"))),
            "program_ids": [p["program_id"] for p in programs],
        })
    return enriched


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path, help="Input PDF path")
    parser.add_argument("--schools", type=Path, default=Path("dataset/schools.json"), help="Existing schools.json path")
    parser.add_argument("--out-dir", type=Path, default=Path("dataset"), help="Output directory")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(args.pdf))
    schools, school_by_norm = load_school_index(args.schools)

    collections: Dict[str, List[dict]] = {}
    unmatched_by_section: Dict[str, List[dict]] = {}

    for output_name, config in SECTION_CONFIG.items():
        raw_rows = extract_table_rows(doc, config["pages"], config["kind"])
        records, unmatched = resolve_table_rows(raw_rows, school_by_norm, config)
        collections[output_name] = records
        unmatched_by_section[output_name] = unmatched

    all_programs = []
    for name in [
        "programs_personal_application_standard",
        "programs_personal_application_ifp",
        "programs_joint_distribution_group1",
        "programs_joint_distribution_group2",
        "programs_joint_distribution_group3",
    ]:
        all_programs.extend(collections[name])
    collections["programs_all"] = all_programs

    for name, rows in collections.items():
        write_csv(args.out_dir / f"{name}.csv", rows)
        write_json(args.out_dir / f"{name}.json", rows)

    schools_enriched = build_schools_enriched(schools, all_programs)
    write_json(args.out_dir / "schools_enriched_with_program_counts.json", schools_enriched)

    report = {
        "source_pdf": str(args.pdf),
        "source_schools_json": str(args.schools),
        "total_program_records": len(all_programs),
        "counts": {name: len(rows) for name, rows in collections.items()},
        "counts_by_application_system": dict(Counter(p["application_system"] for p in all_programs)),
        "counts_by_admission_group": dict(Counter(p["admission_group"] for p in all_programs if p.get("admission_group"))),
        "key_industry_program_count": sum(1 for p in all_programs if p["is_key_industry_program"]),
        "international_foundation_program_count": sum(1 for p in all_programs if p["is_international_foundation_program"]),
        "manual_school_fixes": MANUAL_SCHOOL_FIXES,
        "unmatched_row_counts": {name: len(rows) for name, rows in unmatched_by_section.items()},
        "unmatched_rows_sample": {name: rows[:5] for name, rows in unmatched_by_section.items() if rows[:5]},
        "output_files": sorted(p.name for p in args.out_dir.iterdir()),
    }
    write_json(args.out_dir / "program_extraction_report.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
