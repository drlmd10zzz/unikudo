# UniKudo

UniKudo is an English-first Taiwan university admissions navigator prototype.

The current prototype is a static web app that includes:

- School Explorer with bilingual school names and program coverage.
- Must Reads for bilingual official admissions guide sections.
- Checklist generator with per-account saved checklists.
- Prototype Admissions Q&A.
- Prototype Portal Helper.
- Local prototype registration/sign-in.

## Run Locally

From the project root:

```bash
python3 -m http.server 8000
```

Open:

```txt
http://localhost:8000/prototype/
```

## Prototype Auth

The current account system is for demo purposes only.

- Accounts are stored in the browser's `localStorage`.
- Passwords are hashed with WebCrypto before local storage.
- Saved checklists are scoped to the signed-in local prototype account.
- Do not treat this as production authentication.

Before a public launch, replace this with production auth such as Supabase Auth, Clerk, Auth.js, Firebase Auth, or another server-backed provider.

## Deploy on Vercel

This repo includes `vercel.json`, which redirects `/` to `/prototype/`.

Recommended Vercel settings:

- Framework Preset: Other
- Build Command: leave empty
- Output Directory: leave empty
- Install Command: leave empty

No `.env` file is required for the current static prototype. Do not commit user credentials or API keys.
