# Taiwan Admissions AI Agent Web App — Project Prompt for Codex

## 1. Project Context

We are building an **English-first AI agent web app** for students who want to apply to universities in Taiwan.

The main goal is **not** to fully automate university applications at this stage. The goal is to **reduce language barriers and process confusion** for English-speaking students by helping them understand Taiwan university admissions information, school profiles, portal steps, deadlines, and required documents.

The app should turn official Chinese admission materials, school directory data, and application procedures into clear English explanations and actionable checklists.

The first dataset has already been initialized from an official PDF from the Overseas Joint Admissions Committee. The initial extracted files include:

- `dataset/schools_raw.csv`
- `dataset/schools.json`
- `dataset/programs_all.json`
- `dataset/programs_all.csv`
- `extract_schools.py`
- `extract_programs.py`

The current extracted data includes basic school information and program / department rows with school-level program counts. It does not yet include quotas, admission preference lists, or fully validated school English names.

---

## 2. Product Positioning

The product should be understood as:

> An English-language AI agent web app that helps students understand and navigate Taiwan university admissions by translating official information into actionable school profiles, portal guidance, deadline checklists, and application steps.

The AI should act as a **guided task assistant**, not as an autonomous application submitter.

The app should help students with:

- Understanding schools in Taiwan
- Understanding application tracks
- Understanding official Chinese instructions in English
- Generating deadline and document checklists
- Explaining portal fields and steps
- Helping users prepare, organize, and verify application materials
- Reducing dependence on cram school counselors or private consultants for basic process navigation

The app should **not** claim to guarantee admission or replace official verification.

---

## 3. High-Level Agent Scope

The AI agent should be able to:

1. Understand the user's goal.
2. Ask missing questions when needed.
3. Retrieve relevant official information from structured school data or official admission documents.
4. Explain the information in clear English.
5. Generate step-by-step checklists.
6. Warn users about deadlines, missing documents, and uncertainty.
7. Direct users to official sources for final confirmation.
8. Help translate or explain portal text/screenshots.
9. Assist with application preparation, but require human confirmation before any final decision or submission.

The agent should **not** fully submit applications autonomously in the MVP.

---

## 4. MVP Feature Scope

The MVP should focus on four main areas.

### 4.1 School Explorer

A searchable and filterable school directory based on `dataset/schools.json`.

Core features:

- Display all schools
- Search by Chinese school name
- Search by English name if available
- Filter by region
- Filter by city/county
- Filter by school type/category
- Show school profile details
- Link to official school website
- Display school tags

Example user questions this feature should support:

- “Which universities are in Taipei?”
- “Show me technology universities in northern Taiwan.”
- “What is the website for National Taiwan University?”
- “Which schools are in Kaohsiung?”

---

### 4.2 AI Admissions Q&A

A chat interface where users can ask questions in English about Taiwan university admissions.

Example questions:

- “What is joint distribution?”
- “What documents do I need?”
- “What does this Chinese requirement mean?”
- “How do I know if I am eligible?”
- “What is the difference between personal application and joint distribution?”
- “What should I do after admission?”

Important design requirement:

The AI should answer using source-grounded information whenever possible. The LLM should not be treated as the source of truth. Official PDF content, structured school data, and official URLs should be the real source of truth.

---

### 4.3 Checklist / Timeline Generator

A guided flow that generates an application checklist based on user inputs.

Possible inputs:

- Target intake year
- Application path
- Student type
- Education system
- Whether the student is applying through personal application or joint distribution
- Whether the student is using high school grades, SAT, A-Level, or IBDP
- Whether the student is applying to medicine/dentistry/Chinese medicine
- Current application stage

Output:

- Eligibility checklist
- Required documents checklist
- Online registration steps
- Upload requirements
- Physical document submission reminders
- Deadline reminders
- Post-admission checklist

Example checklist items:

- Confirm overseas Chinese student eligibility
- Prepare proof of overseas residence
- Prepare high school transcripts
- Prepare graduation certificate or current enrollment certificate
- Verify or translate academic documents if needed
- Complete online registration
- Print and sign application forms
- Submit documents to the local representative office or approved unit
- Upload personal application materials before the deadline
- Check admission results
- Prepare visa, health check, ARC/residence documents, and school registration materials

---

### 4.4 Portal Helper

A feature where users can paste Chinese text or upload a screenshot from an application portal, and the AI explains in English what the page means and what the user should do next.

MVP version:

- Text paste input
- Optional screenshot upload if technically feasible
- English explanation
- Field-by-field translation
- Action checklist
- Warnings for irreversible actions such as final submission

Important:

The portal helper should not log into portals or submit forms automatically in the MVP.

---

## 5. Non-MVP / Future Features

These should not be prioritized in the first version:

- Automatic login to university or government portals
- Automatic upload of application materials
- Full autonomous application submission
- Automated completion of legally binding declarations
- Automatic admission probability prediction
- Web crawling of all school websites without validation
- Fully AI-written personal statements without student authorship

These may be considered later only after careful technical, legal, and ethical review.

---

## 6. School Data Schema

The first data layer is the school profile database.

Each school profile should follow this general structure:

```ts
type SchoolProfile = {
  id: string;
  source_id: number;
  name_zh: string;
  name_en?: string | null;
  phone?: string | null;
  address_raw: string;
  postal_code?: string | null;
  city_or_county?: string | null;
  district?: string | null;
  region?: "north" | "central" | "south" | "east" | "islands" | null;
  website?: string | null;

  school_category?: string[];
  tags?: string[];

  source: {
    document: string;
    section: string;
    pdf_pages?: number[];
    source_type: "pdf" | "manual" | "official_website";
  };

  created_at?: string;
  updated_at?: string;
};
```

Example:

```json
{
  "id": "school_001_國立臺灣大學",
  "source_id": 1,
  "name_zh": "國立臺灣大學",
  "name_en": null,
  "phone": "886-2-33662007#271",
  "address_raw": "106319 臺北市羅斯福路4段1號",
  "postal_code": "106319",
  "city_or_county": "臺北市",
  "district": null,
  "region": "north",
  "website": "https://www.ntu.edu.tw/",
  "school_category": [
    "public",
    "general_or_specialized_university"
  ],
  "tags": [
    "臺北市",
    "north",
    "public",
    "general_or_specialized_university"
  ],
  "source": {
    "document": "海外聯合招生委員會 僑生來臺就讀大學校院學士班.pdf",
    "section": "附錄四 115學年度海外聯合招生委員學校通訊錄",
    "pdf_pages": [63],
    "source_type": "pdf"
  }
}
```

---

## 7. Data Handling Rules

### 7.1 Raw and Processed Fields

Always preserve raw fields from the source document.

For example:

- Keep `address_raw`
- Derive `postal_code`, `city_or_county`, `district`, and `region` separately
- Do not overwrite source text with inferred text

### 7.2 Tags and Categories

Tags can be inferred by keyword rules at first.

Example category rules:

- If school name includes `國立` or `市立`, category includes `public`
- If school name includes `科技大學` or `技術學院`, category includes `technology`
- If school name includes `醫` or `醫學`, category includes `medical_health`
- If school name includes `藝術`, category includes `arts`
- If school name includes `體育` or `運動`, category includes `sports`
- If school name includes `師範` or `教育`, category includes `education`
- Otherwise, category may include `general_or_specialized_university` or `private_or_other`

These inferred categories should be treated as non-official convenience labels.

### 7.3 Source Grounding

Every important answer generated by the AI should ideally be backed by:

- Structured data from `dataset/schools.json`
- Official PDF sections
- Official school website URLs
- Last-updated metadata

The system should avoid unsupported claims about deadlines, requirements, or eligibility.

---

## 8. Suggested Technical Stack

A simple MVP stack can be:

- **Frontend:** Next.js / React
- **Backend:** Next.js API routes or Node.js / Express
- **Data:** `dataset/schools.json` for MVP, later PostgreSQL or Supabase
- **AI Layer:** OpenAI API or similar LLM API
- **Retrieval:** Local JSON search first, later vector search / RAG over official documents
- **Styling:** Tailwind CSS or simple component library

Suggested MVP architecture:

```txt
Frontend
  - School Explorer UI
  - School Profile Page
  - AI Chat UI
  - Checklist UI
  - Portal Helper UI

Backend
  - GET /api/schools
  - GET /api/schools/:id
  - GET /api/schools?region=north
  - GET /api/schools?city=臺北市
  - GET /api/schools?type=technology
  - POST /api/ai/chat
  - POST /api/checklist
  - POST /api/portal-helper

Data
  - dataset/schools.json
  - dataset/schools_raw.csv
  - dataset/programs_all.json
  - official admission PDF text chunks later

AI Layer
  - System prompt defining role and limitations
  - Retrieval from school data
  - Retrieval from official admission documents
  - English explanations
  - Checklist generation
```

---

## 9. Suggested File Structure

One possible structure:

```txt
taiwan-admissions-agent/
  dataset/
    schools.json
    schools_raw.csv
    programs_all.json

  scripts/
    extract_schools.py
    extract_programs.py

  src/
    app/
      page.tsx
      schools/
        page.tsx
        [id]/
          page.tsx
      chat/
        page.tsx
      checklist/
        page.tsx
      portal-helper/
        page.tsx

    app/api/
      schools/
        route.ts
      schools/[id]/
        route.ts
      ai/chat/
        route.ts
      checklist/
        route.ts
      portal-helper/
        route.ts

    lib/
      schools.ts
      schoolFilters.ts
      checklist.ts
      ai.ts
      prompts.ts
      sourceGrounding.ts

    components/
      SchoolCard.tsx
      SchoolFilterPanel.tsx
      SchoolProfile.tsx
      ChatBox.tsx
      Checklist.tsx
      PortalHelper.tsx
```

Adjust structure depending on the framework version.

---

## 10. API Design

### 10.1 `GET /api/schools`

Returns a list of school profiles.

Query parameters:

- `q`
- `region`
- `city`
- `type`
- `tag`

Example:

```txt
GET /api/schools?region=north&type=technology
```

Response:

```json
{
  "schools": [
    {
      "id": "school_001_國立臺灣大學",
      "name_zh": "國立臺灣大學",
      "name_en": null,
      "city_or_county": "臺北市",
      "region": "north",
      "website": "https://www.ntu.edu.tw/",
      "tags": ["臺北市", "north", "public"]
    }
  ],
  "count": 1
}
```

---

### 10.2 `GET /api/schools/:id`

Returns one full school profile.

---

### 10.3 `POST /api/checklist`

Input:

```json
{
  "targetYear": "2026",
  "applicationPath": "personal_application",
  "studentType": "overseas_chinese",
  "scoringMethod": "high_school_grades",
  "isMedicalTrack": false,
  "currentStage": "exploring"
}
```

Output:

```json
{
  "checklist": [
    {
      "id": "eligibility",
      "title": "Confirm eligibility",
      "description": "Check whether you meet overseas Chinese student eligibility requirements.",
      "status": "not_started",
      "riskLevel": "high"
    }
  ]
}
```

---

### 10.4 `POST /api/ai/chat`

Input:

```json
{
  "message": "What documents do I need for joint distribution?",
  "context": {
    "studentType": "overseas_chinese",
    "targetYear": "2026"
  }
}
```

Output:

```json
{
  "answer": "You will generally need...",
  "sources": [
    {
      "type": "pdf",
      "title": "Overseas Joint Admissions Committee Admission Guide",
      "section": "Application Documents"
    }
  ],
  "warnings": [
    "Please verify final deadlines with the official admissions website."
  ]
}
```

---

### 10.5 `POST /api/portal-helper`

Input:

```json
{
  "portalText": "請上傳個人申請志願校系審查資料...",
  "language": "en"
}
```

Output:

```json
{
  "translation": "Please upload review materials for your personal application choices...",
  "explanation": "This means you need to upload the required files for each school or department you selected.",
  "actionItems": [
    "Check which documents are required for each school.",
    "Prepare files in the accepted format.",
    "Upload all required files before the deadline.",
    "Do not click final submit until you have reviewed all uploaded files."
  ],
  "riskWarnings": [
    "Final submission may be irreversible."
  ]
}
```

---

## 11. AI Behavior Requirements

The AI should:

- Answer in English by default
- Explain Taiwanese admission terms clearly
- Avoid unsupported claims
- Ask clarifying questions if the user’s status is unclear
- Use official source data when available
- Be explicit when information is incomplete
- Avoid making final decisions for users
- Avoid pretending it has submitted forms or verified portals
- Encourage users to confirm final requirements with official sources

The AI should not:

- Guarantee admission
- Invent deadlines
- Invent school requirements
- Submit applications automatically
- Write false personal statements
- Claim legal authority
- Replace official school or government instructions

---

## 12. Risk and Ethics Principles

### 12.1 Accuracy

High-risk information must be grounded.

High-risk information includes:

- Deadlines
- Required documents
- Eligibility
- Application submission rules
- Visa or residence requirements
- Medical/dentistry/Chinese medicine special requirements
- Irreversible portal actions

### 12.2 Human Confirmation

The user must make final decisions.

The app can guide, explain, and check, but should require users to review and confirm:

- School choices
- Application pathway
- Final documents
- Portal submission
- Personal statement content
- Legal declarations

### 12.3 Writing Assistance

The AI may help with:

- Brainstorming
- Outlining
- English grammar
- Clarity improvement
- Reflection questions
- Structure suggestions

The AI should not fabricate experiences, credentials, awards, or personal history.

### 12.4 Equity

The product should aim to reduce resource gaps by making official information easier to understand.

Consider:

- English-first interface
- Simple explanations
- Glossary of Taiwanese admission terms
- Free basic school search and checklist tools
- Avoiding features that only help already-advantaged users

---

## 13. Suggested First Coding Tasks

Start with small, concrete implementation steps.

### Task 1: Load School Data

- Load `dataset/schools.json`
- Create `src/lib/schools.ts`
- Add functions:
  - `getAllSchools()`
  - `getSchoolById(id)`
  - `filterSchools({ q, region, city, type, tag })`

### Task 2: Build School API

Create:

- `GET /api/schools`
- `GET /api/schools/[id]`

Make sure filtering works.

### Task 3: Build School Explorer UI

Create a page with:

- Search box
- Region filter
- City filter
- Type/category filter
- School cards
- Website link
- Profile detail page

### Task 4: Build Checklist Logic

Create a deterministic checklist generator before using AI.

Input:

- application path
- student type
- scoring method
- medical track flag
- current stage

Output:

- checklist sections and items

### Task 5: Add AI Chat Endpoint

Use the AI API only after the deterministic school search and checklist logic exists.

For the first version, the AI can:

- explain terms
- answer questions about known school data
- summarize checklist steps
- translate portal text

### Task 6: Build Portal Helper

Start with text input only.

Later add screenshot upload if needed.

---

## 14. Suggested Prompt for the AI Agent

Use a system prompt similar to this:

```txt
You are an English-language Taiwan university admissions assistant.

Your job is to help students understand Taiwan university application information, school profiles, portal instructions, deadlines, and required documents.

You must explain official Chinese admission information in clear English.

You are not allowed to guarantee admission, invent deadlines, submit applications, or make final decisions for the student.

When information depends on official requirements, say that the user must verify with the official source. If source data is available, cite or reference it.

For high-risk topics such as eligibility, deadlines, required documents, visa/residence rules, and final submission, be conservative and ask clarifying questions if needed.

You may help users organize ideas for personal statements, but you must not fabricate experiences or credentials.
```

---

## 15. Current Development Priority

Current priority:

1. Build a reliable school data layer.
2. Build a school explorer.
3. Build a checklist generator.
4. Build an English AI assistant for explanations.
5. Build a portal text helper.
6. Later expand to programs, departments, admission quotas, and official requirement pages.

Do not start with full autonomous application submission.

---

## 16. Collaboration Notes

Possible division of work:

### Wenhao

- Data extraction
- Data cleaning
- School profile schema
- Backend APIs
- Checklist logic
- AI prompt design
- Source grounding / RAG later

### Ryan

- Frontend UI
- School explorer page
- School profile layout
- Chat interface
- Checklist dashboard
- User flow and product design

### Shared Decisions

- MVP scope
- Tech stack
- Data update process
- Design style
- Risk boundary
- Which AI features are safe for the first demo

---

## 17. Important Design Principle

The project should be framed as:

> AI-guided application navigation, not AI-controlled application submission.

The student should always remain responsible for final review, final decisions, and final submission.
