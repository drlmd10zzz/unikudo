# UniKudo

UniKudo is an English-first Taiwan university admissions navigator prototype.

The current prototype is a static web app that includes:

- School Explorer with bilingual school names and program coverage.
- Must Reads for bilingual official admissions guide sections.
- Checklist generator with per-account saved checklists.
- Prototype Admissions Q&A.
- Prototype Portal Helper.
- Supabase registration/sign-in.

## Run Locally

From the project root:

```bash
python3 -m http.server 8000
```

Open:

```txt
http://localhost:8000/prototype/
```

The static local server can load the explorer and datasets. Supabase auth requires either a Vercel deployment with environment variables or a local runtime that serves `/api/config`.

## Supabase

UniKudo uses Supabase Auth for email/password accounts and a `saved_checklists` table for account-backed checklist saves.

Setup:

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase/schema.sql`.
3. In Authentication settings, add the deployed Vercel URL to allowed redirect URLs.
4. Copy the Project URL and anon public key.

Never use the Supabase service role key in the browser or in Vercel public config.

## Deploy on Vercel

This repo includes `vercel.json`, which redirects `/` to `/prototype/`.

Recommended Vercel settings:

- Framework Preset: Other
- Build Command: leave empty
- Output Directory: leave empty
- Install Command: leave empty

Environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Do not commit `.env` files, service role keys, GitHub tokens, Vercel tokens, or user credentials.
