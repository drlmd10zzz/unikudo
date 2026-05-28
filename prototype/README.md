# Taiwan Admissions Navigator Prototype

Run from the project root:

```bash
python3 -m http.server 8000
```

Open:

```txt
http://localhost:8000/prototype/
```

The prototype is dependency-free and loads local files from `dataset/`.

Account flow:

- Registration and sign-in are implemented as local prototype auth.
- Users are stored in this browser's `localStorage` with WebCrypto password hashing.
- Generated checklists can be saved, loaded, and deleted per signed-in prototype account.
- Replace this with production auth before launch, such as Supabase Auth, Clerk, Auth.js, or a server-backed Vercel flow.

Implemented surfaces:

- School Explorer with search, region, city, category, and application-track filters.
- School profile panel with source metadata and all extracted programs.
- Deterministic checklist generator.
- Must Reads view for `admission_info_sections_1_to_6_bilingual.json`, with English summaries, detected dates/links, and expandable original Chinese source text.
- Source-aware local Q&A helper.
- Chinese portal text helper with glossary matches and risk warnings.
