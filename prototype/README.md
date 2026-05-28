# Taiwan Admissions Navigator Prototype

Run from the project root:

```bash
python3 -m http.server 8000
```

Open:

```txt
http://localhost:8000/prototype/
```

The prototype loads local files from `dataset/` and uses Supabase Auth when deployed with Supabase environment variables.

Account flow:

- Registration and sign-in are handled by Supabase Auth.
- Saved checklists are stored in the `saved_checklists` Supabase table.
- Row-level security restricts checklist rows to the signed-in user.
- Vercel serves `/api/config`, which reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from environment variables.

Implemented surfaces:

- School Explorer with search, region, city, category, and application-track filters.
- School profile panel with source metadata and all extracted programs.
- Deterministic checklist generator.
- Must Reads view for `admission_info_sections_1_to_6_bilingual.json`, with English summaries, detected dates/links, and expandable original Chinese source text.
- Source-aware local Q&A helper.
- Chinese portal text helper with glossary matches and risk warnings.
