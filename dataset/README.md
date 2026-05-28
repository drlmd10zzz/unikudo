# Dataset Notes

`schools.json` is the canonical school dataset for the web app. It is currently the enriched school file, equivalent to `schools_enriched_with_program_counts.json`.

`schools_base.json` preserves the earlier school-only extraction before program counts were added.

School English names are sourced from the Ministry of Education open-data dataset `official_school_english_names_moe.csv` where available. Newer or renamed schools not present in that file use official school website sources recorded in each school's `name_en_source` field.

Program English names are draft glossary translations added for navigation. Mandarin program names remain the extracted source text.

Key facts:

- `schools.json`: 130 schools, enriched with `program_count_total`, `program_count_by_application_system`, `program_count_by_joint_group`, and `program_ids`.
- Every school has `name_en`, `city_or_county_en`, and `region_en`.
- `schools_base.json`: 130 schools, without program count fields.
- `programs_all.json`: 4,313 program rows, each with `department_name_en`.
- Every `program_id` in `programs_all.json` is referenced by exactly one school through `program_ids`.
- Source ID 60 is fixed in the canonical file: `school_060_馬偕學校財團法人馬偕醫學大學`. The base file had the incomplete ID `school_060_`.
