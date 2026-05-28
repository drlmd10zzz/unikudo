import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_VERSION = "20260528-mobile-2";
const DATASET_ROOT = new URL("../dataset/", window.location.href);
const CONFIG_ENDPOINT = "/api/config";
const SUPABASE_MISSING_MESSAGE =
  "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, then redeploy.";

let supabase = null;

const regionLabels = {
  north: "North",
  central: "Central",
  south: "South",
  east: "East",
  islands: "Islands",
  unknown: "Unknown",
};

const categoryLabels = {
  public: "Public",
  private_or_other: "Private / other",
  general_or_specialized_university: "General / specialized",
  technology: "Technology",
  medical_health: "Medical / health",
  arts: "Arts",
  sports: "Sports",
  education: "Education",
  hospitality: "Hospitality",
  business_management: "Business / management",
};

const trackLabels = {
  personal_application_standard: "Personal application",
  personal_application_ifp: "International foundation",
  joint_distribution: "Joint distribution",
};

const schoolAliases = new Map([
  ["national taiwan university", "國立臺灣大學"],
  ["ntu", "國立臺灣大學"],
  ["national taiwan normal university", "國立臺灣師範大學"],
  ["ntnu", "國立臺灣師範大學"],
  ["national chengchi university", "國立政治大學"],
  ["nccu", "國立政治大學"],
  ["national tsing hua university", "國立清華大學"],
  ["nthu", "國立清華大學"],
  ["national yang ming chiao tung university", "國立陽明交通大學"],
  ["nycu", "國立陽明交通大學"],
  ["national successful university", "國立成功大學"],
  ["ncku", "國立成功大學"],
  ["national taiwan university of science and technology", "國立臺灣科技大學"],
  ["ntust", "國立臺灣科技大學"],
]);

const portalGlossary = [
  ["個人申請", "personal application"],
  ["聯合分發", "joint distribution"],
  ["國際專修部", "international foundation program"],
  ["志願校系", "selected school/department choices"],
  ["審查資料", "review materials"],
  ["報名資料", "registration materials"],
  ["成績單", "transcript"],
  ["畢業證書", "graduation certificate"],
  ["在學證明", "current enrollment certificate"],
  ["身分證明", "identity proof"],
  ["居留", "residence"],
  ["護照", "passport"],
  ["上傳", "upload"],
  ["下載", "download"],
  ["列印", "print"],
  ["簽名", "sign"],
  ["繳費", "pay the fee"],
  ["確認", "confirm"],
  ["送出", "submit"],
  ["截止", "deadline"],
  ["逾期", "late / after the deadline"],
  ["不可修改", "cannot be changed"],
  ["不得更改", "cannot be changed"],
  ["請", "please"],
];

const state = {
  schools: [],
  programs: [],
  admissionInfo: null,
  programsBySchool: new Map(),
  programsById: new Map(),
  searchableSchools: [],
  selectedSchoolId: null,
  currentView: "explorer",
  checklistDone: new Set(),
  currentChecklist: null,
  activeSavedChecklistId: null,
  savedChecklists: [],
  savedChecklistsLoading: false,
  authMode: "register",
  currentUser: null,
  supabaseReady: false,
};

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function labelForCategory(category) {
  return categoryLabels[category] || category.replaceAll("_", " ");
}

function labelForRegion(region) {
  return regionLabels[region || "unknown"] || "Unknown";
}

function labelForTrack(track) {
  return trackLabels[track] || track.replaceAll("_", " ");
}

function cityLabel(cityZh) {
  const school = state.schools.find((item) => item.city_or_county === cityZh);
  const cityEn = school?.city_or_county_en;
  return cityEn ? `${cityEn} / ${cityZh}` : cityZh;
}

function schoolDisplayName(school) {
  return school.name_en ? `${school.name_en} / ${school.name_zh}` : school.name_zh;
}

function locationLabel(school) {
  const city = [school.city_or_county_en, school.city_or_county].filter(Boolean).join(" / ");
  const district = [school.district_en, school.district].filter(Boolean).join(" / ");
  return [city, district].filter(Boolean).join(" · ") || "Location unavailable";
}

function normalizeSearch(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

async function fetchJson(filename) {
  const url = new URL(filename, DATASET_ROOT);
  url.searchParams.set("v", APP_VERSION);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${filename}: ${response.status}`);
  }
  return response.json();
}

async function init() {
  bindAuth();
  await configureSupabase();
  await restoreSupabaseSession();
  renderAuthState();

  try {
    const [schools, programs, report, admissionInfo] = await Promise.all([
      fetchJson("schools.json"),
      fetchJson("programs_all.json"),
      fetchJson("program_extraction_report.json").catch(() => null),
      fetchJson("admission_info_sections_1_to_6_bilingual.json").catch(() => null),
    ]);

    state.schools = schools;
    state.programs = programs;
    state.report = report;
    state.admissionInfo = admissionInfo;
    const missingProgramTranslations = state.programs.filter((program) => !program.department_name_en);
    if (missingProgramTranslations.length) {
      throw new Error(
        `${missingProgramTranslations.length} program translations did not load. Refresh the prototype or rerun enrich_bilingual_dataset.py.`,
      );
    }
    buildIndexes();
    bindNavigation();
    bindExplorer();
    bindChecklist();
    bindAdmissions();
    bindChat();
    bindPortalHelper();
    populateFilters();
    renderStats();
    renderRegionBars();
    renderSchools();
    renderSources();
    renderAdmissionInfo();
    renderDefaultChecklist();
    renderOpeningChat();
    switchView(location.hash.replace("#", "") || "explorer");
  } catch (error) {
    document.body.innerHTML = `
      <main class="main-area">
        <section class="panel">
          <h1>Prototype could not load</h1>
          <p>${escapeHtml(error.message)}</p>
          <p>Serve the project root with <code>python3 -m http.server 8000</code>, then open <code>/prototype/</code>.</p>
        </section>
      </main>
    `;
  }
}

async function configureSupabase() {
  const config = await loadRuntimeConfig();
  const supabaseUrl = String(config.supabaseUrl || config.SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || "").trim();

  state.supabaseReady = Boolean(supabaseUrl && supabaseAnonKey);
  if (!state.supabaseReady) return;

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    void applySupabaseSession(session).catch((error) => {
      setAuthMessage(`Supabase account setup failed: ${error.message}`, "error");
    });
  });
}

async function loadRuntimeConfig() {
  if (window.UNIKUDO_SUPABASE_CONFIG) return window.UNIKUDO_SUPABASE_CONFIG;

  try {
    const response = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });
    if (!response.ok) return {};
    return response.json();
  } catch {
    return {};
  }
}

async function restoreSupabaseSession() {
  if (!supabase) return;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setAuthMessage(error.message, "error");
    return;
  }
  try {
    await applySupabaseSession(data.session);
  } catch (profileError) {
    setAuthMessage(`Supabase account setup failed: ${profileError.message}`, "error");
  }
}

function bindAuth() {
  qsa(".auth-tab").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });

  qs("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleAuthSubmit(new FormData(event.currentTarget));
  });

  qs("#account-button").addEventListener("click", () => {
    qs("#account-panel").hidden = !qs("#account-panel").hidden;
  });

  qs("#account-close-button").addEventListener("click", () => {
    qs("#account-panel").hidden = true;
  });

  qs("#sign-out-button").addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
    clearSignedInState();
    qs("#account-panel").hidden = true;
    renderAuthState("Signed out.");
  });
}

function setAuthMode(mode) {
  state.authMode = mode === "signin" ? "signin" : "register";
  qsa(".auth-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authMode === state.authMode);
  });
  qs("#auth-name-field").style.display = state.authMode === "register" ? "grid" : "none";
  qs("#auth-submit").textContent = state.authMode === "register" ? "Create account" : "Sign in";
  qs("#auth-password").autocomplete = state.authMode === "register" ? "new-password" : "current-password";
  if (state.supabaseReady) setAuthMessage("");
  else setAuthMessage(SUPABASE_MISSING_MESSAGE, "error");
}

async function handleAuthSubmit(formData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const submitButton = qs("#auth-submit");

  if (!supabase) {
    setAuthMessage(SUPABASE_MISSING_MESSAGE, "error");
    return;
  }

  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }
  if (password.length < 8) {
    setAuthMessage("Password must be at least 8 characters.", "error");
    return;
  }

  submitButton.disabled = true;

  try {
    if (state.authMode === "register") {
      if (!name) {
        setAuthMessage("Full name is required.", "error");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: new URL("/prototype/", window.location.origin).href,
        },
      });
      if (error) throw error;

      if (data.session) {
        await applySupabaseSession(data.session, { fullName: name });
        qs("#auth-form").reset();
        setAuthMessage("Account created and signed in.", "success");
      } else {
        setAuthMessage("Account created. Check your email to confirm before signing in.", "success");
      }
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await applySupabaseSession(data.session);
    qs("#auth-form").reset();
    setAuthMessage("Signed in.", "success");
  } catch (error) {
    setAuthMessage(error.message || "Authentication failed.", "error");
  } finally {
    submitButton.disabled = !state.supabaseReady;
  }
}

function renderAuthState(message = "") {
  const user = state.currentUser;
  const isSignedIn = Boolean(user);
  qs("#auth-gate").classList.toggle("is-hidden", isSignedIn);
  qs("#app-shell").classList.toggle("is-auth-hidden", !isSignedIn);

  if (isSignedIn) {
    qs("#account-button").textContent = "My account";
    qs("#account-name").textContent = user.name;
    qs("#account-email").textContent = user.email;
    qs("#account-type").textContent = "Supabase account";
    qs("#account-storage-note").textContent =
      "Your account is managed by Supabase Auth. Saved checklists are stored in the UniKudo Supabase database.";
    renderSavedChecklists();
  } else {
    setAuthMode(state.authMode);
    setAuthControlsEnabled(state.supabaseReady);
    if (!state.supabaseReady) setAuthMessage(SUPABASE_MISSING_MESSAGE, "error");
    else if (message) setAuthMessage(message, "success");
  }
}

function setAuthMessage(message, type = "") {
  const element = qs("#auth-message");
  element.textContent = message;
  element.classList.toggle("error", type === "error");
  element.classList.toggle("success", type === "success");
}

function setAuthControlsEnabled(enabled) {
  qsa("#auth-form input, #auth-submit").forEach((element) => {
    element.disabled = !enabled;
  });
}

async function applySupabaseSession(session, options = {}) {
  if (!session?.user) {
    clearSignedInState();
    renderAuthState();
    return;
  }

  state.currentUser = await getOrCreateProfile(session.user, options.fullName);
  await refreshSavedChecklists();
  renderAuthState();
}

function clearSignedInState() {
  state.currentUser = null;
  state.savedChecklists = [];
  state.currentChecklist = null;
  state.activeSavedChecklistId = null;
  state.checklistDone.clear();
}

async function getOrCreateProfile(user, fullName = "") {
  const fallbackName = fullName || user.user_metadata?.full_name || user.email?.split("@")[0] || "UniKudo user";
  const profile = await fetchProfile(user.id);

  if (profile) {
    if (fullName && profile.full_name !== fullName) {
      const updated = await upsertProfile(user.id, fullName);
      return profileToUser(user, updated || profile);
    }
    return profileToUser(user, profile);
  }

  const inserted = await upsertProfile(user.id, fallbackName);
  return profileToUser(user, inserted || { full_name: fallbackName, created_at: user.created_at });
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertProfile(userId, fullName) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: fullName }, { onConflict: "id" })
    .select("id, full_name, created_at")
    .single();
  if (error) throw error;
  return data;
}

function profileToUser(user, profile) {
  return {
    id: user.id,
    name: profile.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "UniKudo user",
    email: user.email,
    createdAt: profile.created_at || user.created_at,
  };
}

function buildIndexes() {
  state.programsBySchool.clear();
  state.programsById.clear();

  for (const program of state.programs) {
    state.programsById.set(program.program_id, program);
    if (!state.programsBySchool.has(program.school_id)) {
      state.programsBySchool.set(program.school_id, []);
    }
    state.programsBySchool.get(program.school_id).push(program);
  }

  state.searchableSchools = state.schools.map((school) => {
    const programs = state.programsBySchool.get(school.id) || [];
    const programText = programs
      .slice(0, 140)
      .map((program) => [program.department_name_zh, program.department_name_en].join(" "))
      .join(" ");
    const text = [
      school.id,
      school.name_zh,
      school.name_en,
      school.city_or_county,
      school.city_or_county_en,
      school.district_en,
      school.region,
      school.website,
      school.address_raw,
      ...(school.tags || []),
      ...(school.school_category || []),
      programText,
    ].join(" ");

    return {
      ...school,
      programs,
      searchText: normalizeSearch(text),
    };
  });
}

function bindNavigation() {
  qsa(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      history.replaceState(null, "", `#${view}`);
      switchView(view);
    });
  });

  qs("#mobile-view-select").addEventListener("change", (event) => {
    const view = event.currentTarget.value;
    history.replaceState(null, "", `#${view}`);
    switchView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("hashchange", () => {
    switchView(location.hash.replace("#", "") || "explorer");
  });
}

function switchView(view) {
  const knownView = qs(`#view-${view}`) ? view : "explorer";
  state.currentView = knownView;
  qsa(".view").forEach((section) => section.classList.remove("is-visible"));
  qs(`#view-${knownView}`).classList.add("is-visible");
  qsa(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === knownView);
  });
  qs("#mobile-view-select").value = knownView;

  const titles = {
    explorer: "School Explorer",
    checklist: "Checklist Generator",
    admissions: "Must Reads",
    chat: "Admissions Q&A",
    portal: "Portal Helper",
    sources: "Sources",
  };
  qs("#view-title").textContent = titles[knownView];
}

function populateFilters() {
  const regions = uniqueSorted(state.schools.map((school) => school.region || "unknown"));
  const cities = uniqueSorted(state.schools.map((school) => school.city_or_county).filter(Boolean));
  const categories = uniqueSorted(
    state.schools.flatMap((school) => school.school_category || []),
  );

  fillSelect("#region-filter", regions, labelForRegion, "All regions");
  fillSelect("#city-filter", cities, cityLabel, "All cities");
  fillSelect("#category-filter", categories, labelForCategory, "All categories");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), "zh-Hant"));
}

function fillSelect(selector, values, labeler, firstLabel) {
  const select = qs(selector);
  select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>`;
  for (const value of values) {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(value)}">${escapeHtml(labeler(value))}</option>`,
    );
  }
}

function bindExplorer() {
  qs("#school-filter-form").addEventListener("input", () => renderSchools());
}

function currentSchoolFilters() {
  return {
    q: normalizeSearch(qs("#search-input").value),
    region: qs("#region-filter").value,
    city: qs("#city-filter").value,
    category: qs("#category-filter").value,
    track: qs("#track-filter").value,
  };
}

function filterSchools(filters = currentSchoolFilters()) {
  return state.searchableSchools.filter((school) => {
    const region = school.region || "unknown";
    if (filters.region && region !== filters.region) return false;
    if (filters.city && school.city_or_county !== filters.city) return false;
    if (filters.category && !(school.school_category || []).includes(filters.category)) return false;
    if (filters.track) {
      const trackCount = school.program_count_by_application_system?.[filters.track] || 0;
      if (trackCount === 0) return false;
    }
    if (filters.q && !matchesQuery(school, filters.q)) return false;
    return true;
  });
}

function matchesQuery(school, query) {
  if (school.searchText.includes(query)) return true;

  const aliasHit = schoolAliases.get(query);
  if (aliasHit && school.name_zh.includes(aliasHit)) return true;

  for (const [alias, zhName] of schoolAliases) {
    if ((alias.includes(query) || query.includes(alias)) && school.name_zh.includes(zhName)) {
      return true;
    }
  }

  return false;
}

function renderStats() {
  const cities = new Set(state.schools.map((school) => school.city_or_county).filter(Boolean));
  qs("#metric-schools").textContent = formatCount(state.schools.length);
  qs("#metric-programs").textContent = formatCount(state.programs.length);
  qs("#metric-cities").textContent = formatCount(cities.size);
}

function renderRegionBars() {
  const counts = new Map();
  for (const school of state.schools) {
    const region = school.region || "unknown";
    counts.set(region, (counts.get(region) || 0) + 1);
  }
  const max = Math.max(...counts.values());
  const order = ["north", "central", "south", "east", "islands", "unknown"];

  qs("#region-bars").innerHTML = order
    .filter((region) => counts.has(region))
    .map((region) => {
      const count = counts.get(region);
      const width = Math.max(7, Math.round((count / max) * 100));
      return `
        <div class="region-bar-row">
          <span>${escapeHtml(labelForRegion(region))}</span>
          <div class="region-track" aria-hidden="true">
            <div class="region-fill" style="width:${width}%"></div>
          </div>
          <span>${count}</span>
        </div>
      `;
    })
    .join("");
}

function renderSchools() {
  const schools = filterSchools();
  qs("#school-count").textContent = `${formatCount(schools.length)} shown`;

  if (!schools.length) {
    qs("#school-list").innerHTML = `<div class="no-results">No matching schools. Try clearing one filter.</div>`;
    renderProfile(null);
    return;
  }

  if (!schools.some((school) => school.id === state.selectedSchoolId)) {
    state.selectedSchoolId = schools[0].id;
  }

  qs("#school-list").innerHTML = schools
    .slice(0, 80)
    .map((school) => renderSchoolCard(school))
    .join("");

  qsa(".school-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedSchoolId = card.dataset.schoolId;
      renderSchools();
      renderProfile(getSchoolById(state.selectedSchoolId));
      if (window.matchMedia("(max-width: 820px)").matches) {
        qs("#school-profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  renderProfile(getSchoolById(state.selectedSchoolId));
}

function renderSchoolCard(school) {
  const categories = (school.school_category || []).slice(0, 3);
  const tracks = Object.entries(school.program_count_by_application_system || {});
  const selected = school.id === state.selectedSchoolId ? " is-selected" : "";
  return `
    <button class="school-card${selected}" type="button" data-school-id="${escapeHtml(school.id)}">
      <div class="school-card-header">
        <div>
          <p class="school-name">${escapeHtml(school.name_en || school.name_zh)}</p>
          ${school.name_en ? `<p class="school-name-zh">${escapeHtml(school.name_zh)}</p>` : ""}
          <p class="school-address">${escapeHtml(locationLabel(school))}</p>
          <p class="school-meta">${escapeHtml(school.website || "Website unavailable")}</p>
        </div>
        <div class="program-count">
          <strong>${formatCount(school.program_count_total)}</strong>
          <span>programs</span>
        </div>
      </div>
      <div class="badge-list">
        <span class="badge green">${escapeHtml(labelForRegion(school.region))}</span>
        ${categories.map((category) => `<span class="badge">${escapeHtml(labelForCategory(category))}</span>`).join("")}
        ${tracks.slice(0, 2).map(([track, count]) => `<span class="badge blue">${escapeHtml(labelForTrack(track))}: ${count}</span>`).join("")}
      </div>
    </button>
  `;
}

function getSchoolById(id) {
  return state.searchableSchools.find((school) => school.id === id) || null;
}

function programEnglishName(program) {
  return program.department_name_en || "English translation not loaded. Refresh the page.";
}

function renderProfile(school) {
  const profile = qs("#school-profile");
  if (!school) {
    profile.innerHTML = `
      <div class="empty-state">
        <h2>Select a school</h2>
        <p>Profiles show contact details, source pages, and extracted program coverage.</p>
      </div>
    `;
    return;
  }

  const programs = state.programsBySchool.get(school.id) || [];
  const trackRows = Object.entries(school.program_count_by_application_system || {});
  const groupRows = Object.entries(school.program_count_by_joint_group || {});
  const sourcePages = school.source?.pdf_pages?.join(", ") || "not listed";
  const nameSource = school.name_en_source?.url
    ? `<a href="${escapeHtml(school.name_en_source.url)}" target="_blank" rel="noreferrer">${escapeHtml(school.name_en_source.title || school.name_en_source.url)}</a>`
    : escapeHtml(school.name_en_source?.title || "Unavailable");

  profile.innerHTML = `
    <div class="profile-block">
      <div class="profile-title">
        <div class="badge-list">
          <span class="badge green">${escapeHtml(labelForRegion(school.region))}</span>
          <span class="badge blue">${formatCount(school.program_count_total)} programs</span>
        </div>
        <h2>${escapeHtml(school.name_en || school.name_zh)}</h2>
        ${school.name_en ? `<p class="school-name-zh large">${escapeHtml(school.name_zh)}</p>` : ""}
      </div>

      <div class="detail-grid">
        <div class="detail-row"><strong>City/county</strong><span>${escapeHtml(locationLabel(school))}</span></div>
        <div class="detail-row"><strong>Website</strong><span>${school.website ? `<a href="${escapeHtml(school.website)}" target="_blank" rel="noreferrer">${escapeHtml(school.website)}</a>` : "Unavailable"}</span></div>
        <div class="detail-row"><strong>English name</strong><span>${nameSource}</span></div>
        <div class="detail-row"><strong>Phone</strong><span>${escapeHtml(school.phone || "Unavailable")}</span></div>
        <div class="detail-row"><strong>Address</strong><span>${escapeHtml(school.address_raw || "Unavailable")}</span></div>
        <div class="detail-row"><strong>Source</strong><span>${escapeHtml(school.source?.section || "Source section unavailable")} · page ${escapeHtml(sourcePages)}</span></div>
      </div>

      <div>
        <h3>Program coverage</h3>
        <div class="badge-list">
          ${trackRows.map(([track, count]) => `<span class="badge blue">${escapeHtml(labelForTrack(track))}: ${count}</span>`).join("")}
          ${groupRows.map(([group, count]) => `<span class="badge amber">${escapeHtml(group)}: ${count}</span>`).join("")}
        </div>
      </div>

      <div>
        <h3>All extracted programs</h3>
        <p class="source-meta">English program names are draft translations for navigation; Mandarin names remain the source text.</p>
        <div class="program-table-wrap">
          <table class="program-table">
            <thead>
              <tr>
                <th>Track</th>
                <th>Program / 校系</th>
                <th>Page</th>
              </tr>
            </thead>
            <tbody>
              ${programs
                .map(
                  (program) => `
                    <tr>
                      <td data-label="Track">${escapeHtml(labelForTrack(program.application_system))}${program.admission_group ? `<br><span class="source-meta">${escapeHtml(program.admission_group)}</span>` : ""}</td>
                      <td data-label="Program / 校系">
                        <strong>${escapeHtml(programEnglishName(program))}</strong>
                        <span class="program-zh">${escapeHtml(program.department_name_clean_zh || program.department_name_zh)}</span>
                      </td>
                      <td data-label="Page">${escapeHtml(program.source_pdf_page)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function bindChecklist() {
  qs("#checklist-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input = Object.fromEntries(formData.entries());
    input.isMedicalTrack = formData.has("isMedicalTrack");
    state.checklistDone.clear();
    state.activeSavedChecklistId = null;
    renderChecklist(buildChecklist(input), input);
  });

  qs("#reset-checklist").addEventListener("click", () => {
    state.checklistDone.clear();
    state.activeSavedChecklistId = null;
    renderDefaultChecklist();
  });

  qs("#save-checklist").addEventListener("click", () => {
    void saveCurrentChecklist();
  });

  qs("#saved-checklists").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-checklist-action]");
    if (!button) return;
    const id = button.dataset.checklistId;
    if (button.dataset.checklistAction === "load") loadSavedChecklist(id);
    if (button.dataset.checklistAction === "delete") void deleteSavedChecklist(id);
  });
}

function bindAdmissions() {
  const search = qs("#admission-search");
  if (!search) return;
  search.addEventListener("input", () => renderAdmissionInfo(search.value));
}

function renderAdmissionInfo(query = "") {
  const overview = qs("#admission-overview");
  const content = qs("#admission-content");
  const toc = qs("#admission-toc");
  if (!overview || !content || !toc) return;

  const data = state.admissionInfo;
  if (!data?.sections?.length) {
    overview.innerHTML = `
      <div class="empty-state">
        <h2>Admission guide not loaded</h2>
        <p>Expected dataset/admission_info_sections_1_to_6_bilingual.json.</p>
      </div>
    `;
    content.innerHTML = "";
    toc.innerHTML = "";
    return;
  }

  const normalizedQuery = normalizeSearch(query);
  const sections = data.sections.filter((section) => admissionSectionMatches(section, normalizedQuery));
  const allUrls = uniqueSorted(data.sections.flatMap((section) => collectAdmissionValues(section, "urls_detected")).map(cleanUrl).filter(Boolean));

  overview.innerHTML = `
    <div class="admission-overview">
      <div>
        <p class="section-kicker">2026 fall admission</p>
        <h2>${escapeHtml(data.document?.title_en || "Admission guide")}</h2>
        <p class="source-meta">${escapeHtml(data.document?.title_zh || "")}</p>
      </div>
      <p>${escapeHtml(data.document?.translation_note || "English summaries are for navigation; original Chinese remains the source text.")}</p>
      <div class="badge-list">
        <span class="badge blue">${formatCount(data.sections.length)} sections</span>
        <span class="badge green">${formatCount(data.chunks?.length || 0)} source chunks</span>
      </div>
      ${renderContactBlock(data.contact_information)}
    </div>
  `;

  toc.innerHTML = sections.length
    ? sections
        .map(
          (section) => `
            <a href="#admission-${escapeHtml(section.section_id)}">
              <strong>${escapeHtml(section.section_id)}. ${escapeHtml(section.en?.title || section.zh?.title)}</strong>
              <span>${escapeHtml(section.zh?.title || "")}</span>
            </a>
          `,
        )
        .join("")
    : `<div class="no-results">No matching admission sections.</div>`;

  content.innerHTML = sections.length
    ? sections.map(renderAdmissionSection).join("")
    : `<div class="no-results">No matching admission information. Try a broader search.</div>`;

  if (!query && allUrls.length) {
    content.insertAdjacentHTML(
      "beforeend",
      `
        <article class="panel admission-card">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Links</p>
              <h2>Detected official URLs</h2>
            </div>
          </div>
          <div class="link-grid">
            ${allUrls.slice(0, 16).map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`).join("")}
          </div>
        </article>
      `,
    );
  }
}

function admissionSectionMatches(section, query) {
  if (!query) return true;
  const text = [
    section.section_id,
    section.zh?.title,
    section.zh?.raw_text,
    section.en?.title,
    section.en?.summary,
    ...(section.subsections || []).flatMap((subsection) => [
      subsection.zh?.title,
      subsection.zh?.raw_text,
      subsection.en?.title,
      subsection.en?.summary,
    ]),
  ].join(" ");
  return normalizeSearch(text).includes(query);
}

function renderAdmissionSection(section) {
  const urls = uniqueSorted(collectAdmissionValues(section, "urls_detected").map(cleanUrl).filter(Boolean)).slice(0, 8);
  const pageRange = section.page_range_estimate?.length ? `Pages ${section.page_range_estimate.join("-")}` : "Pages not listed";

  return `
    <article class="panel admission-card" id="admission-${escapeHtml(section.section_id)}">
      <div class="admission-card-head">
        <div>
          <p class="section-kicker">${escapeHtml(section.section_id)} · ${escapeHtml(pageRange)}</p>
          <h2>${escapeHtml(section.en?.title || section.zh?.title)}</h2>
          <p class="school-name-zh large">${escapeHtml(section.zh?.heading || section.zh?.title || "")}</p>
        </div>
      </div>

      <p class="admission-summary">${escapeHtml(section.en?.summary || "")}</p>

      ${urls.length ? `<div class="link-grid compact">${urls.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`).join("")}</div>` : ""}

      ${(section.subsections || []).length ? `<div class="subsection-list">${section.subsections.map(renderAdmissionSubsection).join("")}</div>` : ""}

      <details class="source-details">
        <summary>Original Chinese source text</summary>
        <pre>${escapeHtml(section.zh?.raw_text || "No Chinese source text available.")}</pre>
      </details>
    </article>
  `;
}

function renderAdmissionSubsection(subsection) {
  const urls = uniqueSorted((subsection.urls_detected || []).map(cleanUrl).filter(Boolean)).slice(0, 4);

  return `
    <details class="subsection-card">
      <summary>
        <span>
          <strong>${escapeHtml(subsection.subsection_id)}. ${escapeHtml(subsection.en?.title || subsection.zh?.title || "Subsection")}</strong>
          <span>${escapeHtml(subsection.zh?.title || "")}</span>
        </span>
      </summary>
      <p>${escapeHtml(subsection.en?.summary || "")}</p>
      ${urls.length ? `<div class="link-grid compact">${urls.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`).join("")}</div>` : ""}
      <details class="source-details nested">
        <summary>Original Chinese subsection text</summary>
        <pre>${escapeHtml(subsection.zh?.raw_text || "No Chinese source text available.")}</pre>
      </details>
    </details>
  `;
}

function collectAdmissionValues(section, key) {
  return [
    ...(section[key] || []),
    ...(section.subsections || []).flatMap((subsection) => subsection[key] || []),
  ];
}

function cleanInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanUrl(value) {
  const text = cleanInlineText(value)
    .replace(/^.*?(https?:\/\/)/, "$1")
    .replace(/[)）」。，,]+$/g, "");
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    return url.href;
  } catch {
    return "";
  }
}

function renderContactBlock(contact) {
  if (!contact) return "";
  const website = contact.website?.startsWith("http") ? contact.website : `https://${contact.website}`;
  return `
    <div class="contact-strip">
      <span>${escapeHtml(contact.phone || "")}</span>
      <a href="mailto:${escapeHtml(contact.email || "")}">${escapeHtml(contact.email || "")}</a>
      <a href="${escapeHtml(website)}" target="_blank" rel="noreferrer">${escapeHtml(contact.website || "")}</a>
    </div>
  `;
}

function renderDefaultChecklist() {
  const form = qs("#checklist-form");
  const formData = new FormData(form);
  const input = Object.fromEntries(formData.entries());
  input.isMedicalTrack = formData.has("isMedicalTrack");
  renderChecklist(buildChecklist(input), input);
}

function getChecklistTitle(input) {
  return `${input.targetYear} · ${humanize(input.applicationPath)} · ${humanize(input.currentStage)}`;
}

function getUserChecklists() {
  return state.currentUser ? state.savedChecklists : [];
}

async function refreshSavedChecklists() {
  if (!state.currentUser || !supabase) {
    state.savedChecklists = [];
    renderSavedChecklists();
    return;
  }

  state.savedChecklistsLoading = true;
  renderSavedChecklists();

  const { data, error } = await supabase
    .from("saved_checklists")
    .select("id, title, input, sections, completed_item_ids, created_at, updated_at")
    .order("updated_at", { ascending: false });

  state.savedChecklistsLoading = false;
  if (error) {
    state.savedChecklists = [];
    renderSavedChecklists();
    showChecklistMessage(`Could not load saved checklists: ${error.message}`, "error");
    return;
  }

  state.savedChecklists = (data || []).map(rowToChecklist);
  renderSavedChecklists();
}

async function saveCurrentChecklist(options = {}) {
  if (!state.currentUser) {
    showChecklistMessage("Sign in before saving a checklist.", "error");
    return;
  }
  if (!supabase) {
    showChecklistMessage(SUPABASE_MISSING_MESSAGE, "error");
    return;
  }
  if (!state.currentChecklist) renderDefaultChecklist();

  const snapshot = {
    id: state.activeSavedChecklistId || createChecklistId(),
    title: getChecklistTitle(state.currentChecklist.input),
    input: state.currentChecklist.input,
    sections: state.currentChecklist.sections,
    completedItemIds: [...state.checklistDone],
  };

  const { data, error } = await supabase
    .from("saved_checklists")
    .upsert(
      {
        id: snapshot.id,
        user_id: state.currentUser.id,
        title: snapshot.title,
        input: snapshot.input,
        sections: snapshot.sections,
        completed_item_ids: snapshot.completedItemIds,
      },
      { onConflict: "id" },
    )
    .select("id, title, input, sections, completed_item_ids, created_at, updated_at")
    .single();

  if (error) {
    showChecklistMessage(`Checklist could not be saved: ${error.message}`, "error");
    return;
  }

  const saved = rowToChecklist(data);
  const checklists = [...state.savedChecklists];
  const existingIndex = checklists.findIndex((item) => item.id === saved.id);
  if (existingIndex >= 0) {
    checklists[existingIndex] = saved;
  } else {
    checklists.unshift(saved);
  }

  state.savedChecklists = checklists.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  state.activeSavedChecklistId = saved.id;
  renderSavedChecklists();
  if (!options.silent) showChecklistMessage("Checklist saved to your account.");
}

function loadSavedChecklist(id) {
  const checklist = getUserChecklists().find((item) => item.id === id);
  if (!checklist) return;
  state.activeSavedChecklistId = checklist.id;
  state.checklistDone = new Set(checklist.completedItemIds || []);
  applyChecklistInput(checklist.input);
  renderChecklist(checklist.sections || buildChecklist(checklist.input), checklist.input);
  showChecklistMessage("Saved checklist loaded.");
}

async function deleteSavedChecklist(id) {
  if (!state.currentUser || !supabase) return;
  const { error } = await supabase.from("saved_checklists").delete().eq("id", id);
  if (error) {
    showChecklistMessage(`Checklist could not be deleted: ${error.message}`, "error");
    return;
  }

  state.savedChecklists = getUserChecklists().filter((item) => item.id !== id);
  if (state.activeSavedChecklistId === id) state.activeSavedChecklistId = null;
  renderSavedChecklists();
  showChecklistMessage("Saved checklist deleted.");
}

function rowToChecklist(row) {
  return {
    id: row.id,
    title: row.title,
    input: row.input || {},
    sections: row.sections || [],
    completedItemIds: Array.isArray(row.completed_item_ids) ? row.completed_item_ids : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createChecklistId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function applyChecklistInput(input) {
  const form = qs("#checklist-form");
  for (const [key, value] of Object.entries(input || {})) {
    const field = form.elements.namedItem(key);
    if (!field) continue;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value;
  }
}

function renderSavedChecklists() {
  const list = qs("#saved-checklists");
  const count = qs("#saved-checklist-count");
  if (!list || !count) return;

  const checklists = getUserChecklists();
  if (!state.currentUser) {
    count.textContent = "Sign in required";
    list.innerHTML = `<p class="source-meta">Sign in to save checklists to your UniKudo account.</p>`;
    return;
  }
  if (state.savedChecklistsLoading) {
    count.textContent = "Loading";
    list.innerHTML = `<p class="source-meta">Loading saved checklists...</p>`;
    return;
  }

  count.textContent = `${checklists.length} saved`;
  list.innerHTML = checklists.length
    ? checklists
        .map(
          (checklist) => `
            <article class="saved-checklist-card${checklist.id === state.activeSavedChecklistId ? " is-active" : ""}">
              <div>
                <strong>${escapeHtml(checklist.title)}</strong>
                <span>${escapeHtml(formatSavedDate(checklist.updatedAt || checklist.createdAt))}</span>
              </div>
              <div class="saved-actions">
                <button type="button" data-checklist-action="load" data-checklist-id="${escapeHtml(checklist.id)}">Load</button>
                <button type="button" data-checklist-action="delete" data-checklist-id="${escapeHtml(checklist.id)}">Delete</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="source-meta">No saved checklists yet. Generate one and click Save.</p>`;
}

function formatSavedDate(value) {
  if (!value) return "Saved date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function showChecklistMessage(message, type = "") {
  const output = qs("#checklist-output");
  const existing = output.querySelector(".checklist-message");
  if (existing) existing.remove();
  output.insertAdjacentHTML("afterbegin", `<p class="checklist-message ${escapeHtml(type)}">${escapeHtml(message)}</p>`);
}

function buildChecklist(input) {
  const sections = [
    {
      title: "Eligibility",
      items: [
        item("eligibility-status", "Confirm student eligibility", "Verify whether you qualify under the official overseas Chinese or international student rules before choosing a pathway.", "high"),
        item("identity-docs", "Collect identity and residence proof", "Prepare passport, identity documents, and any overseas residence evidence required by the official application rules.", "high"),
      ],
    },
    {
      title: "Academic documents",
      items: [
        item("transcripts", "Prepare transcripts", "Gather high school transcripts and check whether official translation, notarization, or verification is required.", "high"),
        item("graduation", "Prepare graduation or enrollment proof", "Use a graduation certificate if completed, or current enrollment proof if still studying.", "medium"),
      ],
    },
    {
      title: "Online registration",
      items: [
        item("account", "Create and review portal account", "Use your legal name consistently and check every required field before saving.", "medium"),
        item("application-form", "Print and sign required forms", "Some workflows require printed or signed application forms after online registration.", "medium"),
      ],
    },
  ];

  if (input.applicationPath === "personal_application" || input.applicationPath === "both") {
    sections.push({
      title: "Personal application",
      items: [
        item("personal-materials", "Prepare school-specific review materials", "Each selected department may ask for different review files. Confirm requirements from the official list before upload.", "high"),
        item("upload-review", "Upload review materials", "Check file names, accepted formats, and whether the portal has a final-submit action.", "high"),
      ],
    });
  }

  if (input.applicationPath === "joint_distribution" || input.applicationPath === "both") {
    sections.push({
      title: "Joint distribution",
      items: [
        item("group-check", "Confirm admission group", "Review whether your intended departments belong to group 1, group 2, or group 3.", "medium"),
        item("preference-list", "Review preference order", "Your preference list is a final decision surface. Recheck school and department codes against official sources.", "high"),
      ],
    });
  }

  if (input.scoringMethod && input.scoringMethod !== "high_school_grades") {
    sections[1].items.push(
      item("score-format", "Check score format rules", "Confirm how SAT, A-Level, IBDP, or mixed records must be submitted and whether conversion or verification is needed.", "high"),
    );
  }

  if (input.isMedicalTrack) {
    sections.push({
      title: "Special track caution",
      items: [
        item("medical-rules", "Verify medicine and health-track rules", "Medicine, dentistry, Chinese medicine, and health-related programs may have special requirements or restrictions.", "high"),
        item("licensing-note", "Check future licensing implications", "Admission and future professional licensing are separate issues. Confirm both through official sources.", "high"),
      ],
    });
  }

  if (input.currentStage === "submitted" || input.currentStage === "admitted") {
    sections.push({
      title: "After submission",
      items: [
        item("results", "Monitor admission result announcements", "Use the official portal and published schedule. Do not rely on memory or unofficial reposts.", "medium"),
        item("post-admission", "Prepare post-admission documents", "Plan for visa, health check, residence/ARC, and university registration materials after admission.", "medium"),
      ],
    });
  }

  sections.push({
    title: "Final verification",
    items: [
      item("deadline-source", "Verify deadlines from official sources", "Deadlines are high-risk information and are not hard-coded in this prototype.", "high"),
      item("source-copy", "Keep a copy of source pages", "Save official instructions, confirmation pages, receipts, and submission records for your own review.", "medium"),
    ],
  });

  return sections;
}

function item(id, title, description, riskLevel) {
  return { id, title, description, riskLevel };
}

function renderChecklist(sections, input) {
  state.currentChecklist = {
    input: { ...input },
    sections,
  };
  const title = getChecklistTitle(input);
  qs("#checklist-output").innerHTML = `
    <p class="school-meta">${escapeHtml(title)}</p>
    ${sections
      .map(
        (section) => `
          <section class="checklist-section">
            <h3>${escapeHtml(section.title)}</h3>
            ${section.items.map(renderChecklistItem).join("")}
          </section>
        `,
      )
      .join("")}
  `;

  qsa(".checklist-item input").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const id = checkbox.dataset.itemId;
      if (checkbox.checked) state.checklistDone.add(id);
      else state.checklistDone.delete(id);
      checkbox.closest(".checklist-item").classList.toggle("done", checkbox.checked);
      if (state.activeSavedChecklistId) void saveCurrentChecklist({ silent: true });
    });
  });
}

function renderChecklistItem(itemData) {
  const done = state.checklistDone.has(itemData.id);
  return `
    <label class="checklist-item${done ? " done" : ""}">
      <input type="checkbox" data-item-id="${escapeHtml(itemData.id)}" ${done ? "checked" : ""} />
      <span>
        <span class="item-title">${escapeHtml(itemData.title)}</span>
        <span class="item-text">${escapeHtml(itemData.description)}</span>
      </span>
      <span class="risk ${escapeHtml(itemData.riskLevel)}">${escapeHtml(itemData.riskLevel)}</span>
    </label>
  `;
}

function humanize(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bindChat() {
  qs("#chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = qs("#chat-input");
    const message = input.value.trim();
    if (!message) return;
    addChatBubble("user", message);
    const response = answerQuestion(message);
    addChatBubble("assistant", response.answer, response.sources, response.warnings);
    input.value = "";
  });

  qs("#prompt-chips").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-prompt]");
    if (!button) return;
    qs("#chat-input").value = button.dataset.prompt;
    qs("#chat-form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  });
}

function renderOpeningChat() {
  qs("#chat-log").innerHTML = "";
  addChatBubble(
    "assistant",
    "Ask about school locations, categories, websites, application tracks, or document preparation. I will use the local school and program dataset when possible and mark uncertain items.",
    ["dataset/schools.json", "dataset/programs_all.json"],
    ["Deadlines, eligibility, and final submission rules must be confirmed with official sources."],
  );
}

function addChatBubble(role, message, sources = [], warnings = []) {
  const sourceHtml = sources.length
    ? `<div class="chat-sources"><strong>Sources:</strong> ${sources.map(escapeHtml).join(" · ")}</div>`
    : "";
  const warningHtml = warnings.length
    ? `<div class="chat-sources"><strong>Warnings:</strong> ${warnings.map(escapeHtml).join(" · ")}</div>`
    : "";

  qs("#chat-log").insertAdjacentHTML(
    "beforeend",
    `
      <div class="chat-bubble ${role}">
        ${paragraphs(message)}
        ${sourceHtml}
        ${warningHtml}
      </div>
    `,
  );
  qs("#chat-log").scrollTop = qs("#chat-log").scrollHeight;
}

function paragraphs(message) {
  return String(message)
    .split("\n")
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function answerQuestion(message) {
  const query = normalizeSearch(message);
  const city = detectCity(query);
  const region = detectRegion(query);
  const category = detectCategory(query);
  const school = detectSchool(query);

  if (school && (query.includes("website") || query.includes("site") || query.includes("link"))) {
    return {
      answer: `${schoolDisplayName(school)} is listed with this official website: ${school.website || "not available in the dataset"}.`,
      sources: [`${school.source?.section || "School directory"} · PDF page ${(school.source?.pdf_pages || []).join(", ")}`],
      warnings: ["Website URLs should still be opened and verified before use."],
    };
  }

  if (city || region || category || query.includes("which") || query.includes("show me")) {
    const filters = {
      q: "",
      city: city || "",
      region: region || "",
      category: category || "",
      track: query.includes("joint") ? "joint_distribution" : "",
    };
    const schools = filterSchools(filters).slice(0, 12);
    if (schools.length) {
      const lines = schools.map((item) => {
        const count = item.program_count_total || 0;
        return `- ${schoolDisplayName(item)} (${locationLabel(item)}, ${count} extracted programs)`;
      });
      return {
        answer: `I found ${filterSchools(filters).length} matching schools. Here are the first ${schools.length}:\n${lines.join("\n")}`,
        sources: ["dataset/schools.json", "dataset/programs_all.json"],
        warnings: ["Categories and regions are convenience labels; final program requirements need official confirmation."],
      };
    }
  }

  if (query.includes("joint distribution") || query.includes("joint distribution")) {
    return {
      answer:
        "Joint distribution is an application path where applicants use official rules and school/department choices to participate in a distribution process. In this dataset, joint distribution programs are grouped into 第一類組, 第二類組, and 第三類組, with extracted choice codes for those rows.",
      sources: ["dataset/programs_joint_distribution_group1.json", "dataset/programs_joint_distribution_group2.json", "dataset/programs_joint_distribution_group3.json"],
      warnings: ["This prototype explains the dataset structure; it does not decide eligibility or final preference ordering."],
    };
  }

  if (query.includes("document") || query.includes("documents") || query.includes("need")) {
    return {
      answer:
        "For preparation, start with eligibility proof, identity/residence documents, high school transcripts, graduation or enrollment proof, online registration forms, and any department-specific review materials. If your documents are not in the accepted language or format, check whether translation, notarization, or verification is required.",
      sources: ["Prototype checklist rules", "Project prompt risk policy"],
      warnings: ["The exact required documents and deadlines are high-risk details. Verify them against the official admissions guide and portal."],
    };
  }

  if (query.includes("personal application")) {
    return {
      answer:
        "Personal application usually requires checking school-specific program requirements and preparing review materials for selected departments. The dataset has 2,029 standard personal application program rows and 46 international foundation program rows.",
      sources: ["dataset/programs_personal_application_standard.json", "dataset/programs_personal_application_ifp.json"],
      warnings: ["Department review materials can differ by school. Do not reuse one checklist blindly."],
    };
  }

  if (query.includes("eligible") || query.includes("eligibility")) {
    return {
      answer:
        "Eligibility depends on your student status, education history, nationality/residence facts, and the official rules for the target year. I can help organize what to check, but I should not make the final eligibility decision without official requirements and your exact background.",
      sources: ["Project prompt risk policy"],
      warnings: ["Eligibility is high-risk. Confirm with the official admissions committee or school office."],
    };
  }

  if (school) {
    const programs = state.programsBySchool.get(school.id) || [];
    const tracks = Object.entries(school.program_count_by_application_system || {})
      .map(([track, count]) => `${labelForTrack(track)}: ${count}`)
      .join(", ");
    return {
      answer: `${schoolDisplayName(school)} is listed in ${locationLabel(school)} with ${programs.length} extracted programs. Program coverage: ${tracks || "none listed"}. Website: ${school.website || "not available"}.`,
      sources: [`${school.source?.section || "School directory"} · PDF page ${(school.source?.pdf_pages || []).join(", ")}`, "dataset/programs_all.json"],
      warnings: ["Program count is extracted coverage, not a quota or admission chance."],
    };
  }

  return {
    answer:
      "I can help with school search, application path explanations, document preparation, and Chinese portal text. I do not have enough grounded information to answer that precisely yet, so please add a school name, city, track, or pasted official text.",
    sources: ["Prototype local rules"],
    warnings: ["Unsupported claims about deadlines, eligibility, quotas, or submission rules are intentionally avoided."],
  };
}

function detectCity(query) {
  const map = [
    ["new taipei", "新北市"],
    ["taipei", "臺北市"],
    ["kaohsiung", "高雄市"],
    ["taichung", "臺中市"],
    ["tainan", "臺南市"],
    ["taoyuan", "桃園市"],
    ["hsinchu", "新竹市"],
    ["keelung", "基隆市"],
    ["chiayi", "嘉義市"],
    ["hualien", "花蓮縣"],
    ["taitung", "臺東縣"],
    ["penghu", "澎湖縣"],
    ["kinmen", "金門縣"],
  ];
  for (const [needle, city] of map) {
    if (query.includes(needle)) return city;
  }
  return state.schools.find((school) => {
    return query.includes(normalizeSearch(school.city_or_county)) ||
      query.includes(normalizeSearch(school.city_or_county_en));
  })?.city_or_county || "";
}

function detectRegion(query) {
  if (query.includes("north") || query.includes("northern")) return "north";
  if (query.includes("central")) return "central";
  if (query.includes("south") || query.includes("southern")) return "south";
  if (query.includes("east") || query.includes("eastern")) return "east";
  if (query.includes("island")) return "islands";
  return "";
}

function detectCategory(query) {
  if (query.includes("technology") || query.includes("tech")) return "technology";
  if (query.includes("medical") || query.includes("medicine") || query.includes("health")) return "medical_health";
  if (query.includes("art")) return "arts";
  if (query.includes("sport")) return "sports";
  if (query.includes("education") || query.includes("normal university")) return "education";
  if (query.includes("public") || query.includes("national")) return "public";
  return "";
}

function detectSchool(query) {
  for (const [alias, zhName] of schoolAliases) {
    if (query.includes(alias)) {
      return state.searchableSchools.find((school) => school.name_zh === zhName) || null;
    }
  }

  return (
    state.searchableSchools.find((school) => {
      const zh = normalizeSearch(school.name_zh);
      return zh && query.includes(zh);
    }) || null
  );
}

function bindPortalHelper() {
  qs("#portal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("portalText").trim();
    renderPortalExplanation(text);
  });
}

function renderPortalExplanation(text) {
  if (!text) {
    qs("#portal-output").className = "portal-output empty-state";
    qs("#portal-output").innerHTML = `
      <h2>Paste portal text</h2>
      <p>The helper will translate common admissions terms, split fields, and flag final-submit warnings.</p>
    `;
    return;
  }

  const lines = text
    .split(/\n|。|；|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matchedTerms = portalGlossary.filter(([term]) => text.includes(term));
  const warnings = buildPortalWarnings(text);
  const actions = buildPortalActions(text);

  qs("#portal-output").className = "portal-output";
  qs("#portal-output").innerHTML = `
    <div>
      <h3>Detected terms</h3>
      <div class="badge-list">
        ${matchedTerms.length ? matchedTerms.map(([term, meaning]) => `<span class="badge blue">${escapeHtml(term)}: ${escapeHtml(meaning)}</span>`).join("") : `<span class="badge amber">No glossary match</span>`}
      </div>
    </div>

    <div>
      <h3>Field-by-field explanation</h3>
      ${lines
        .map(
          (line) => `
            <div class="translated-line">
              <strong>${escapeHtml(line)}</strong>
              <span>${escapeHtml(explainPortalLine(line))}</span>
            </div>
          `,
        )
        .join("")}
    </div>

    <div>
      <h3>Action checklist</h3>
      <ul class="action-list">${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
    </div>

    <div>
      <h3>Risk warnings</h3>
      <ul class="action-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
    </div>
  `;
}

function explainPortalLine(line) {
  const matches = portalGlossary.filter(([term]) => line.includes(term));
  if (!matches.length) {
    return "This line is not in the prototype glossary yet. Treat it as official portal text and confirm it carefully.";
  }

  const meanings = matches.map(([term, meaning]) => `${term} means ${meaning}`);
  if (line.includes("上傳")) {
    meanings.push("The page is probably asking you to upload a file or supporting material.");
  }
  if (line.includes("送出") || line.includes("確認")) {
    meanings.push("This may be a confirmation step; review before continuing.");
  }
  return meanings.join("; ") + ".";
}

function buildPortalActions(text) {
  const actions = ["Read every field label before entering information."];
  if (text.includes("上傳")) actions.push("Prepare the requested files and check format, size, and naming requirements.");
  if (text.includes("審查資料")) actions.push("Match review materials to each selected school or department.");
  if (text.includes("列印")) actions.push("Print the form after confirming the information is complete.");
  if (text.includes("簽名")) actions.push("Sign only after checking that the printed form matches your portal data.");
  if (text.includes("繳費")) actions.push("Save payment receipts and confirmation numbers.");
  if (text.includes("截止") || text.includes("逾期")) actions.push("Verify the exact deadline on the official portal.");
  actions.push("Keep screenshots or PDFs of confirmation pages for your records.");
  return actions;
}

function buildPortalWarnings(text) {
  const warnings = [];
  if (text.includes("送出") || text.includes("確認")) {
    warnings.push("Final submit or confirmation actions may be irreversible.");
  }
  if (text.includes("不可修改") || text.includes("不得更改")) {
    warnings.push("The text says changes may not be allowed after this step.");
  }
  if (text.includes("截止") || text.includes("逾期")) {
    warnings.push("Deadline language is high-risk. Confirm the exact date and timezone from the official source.");
  }
  if (!warnings.length) {
    warnings.push("No irreversible-action warning detected, but official portal steps still require careful review.");
  }
  return warnings;
}

function renderSources() {
  const report = state.report || {};
  const sourceItems = [
    {
      title: "dataset/schools.json",
      text: `${formatCount(state.schools.length)} schools with Mandarin and official English names, bilingual city/county fields, source metadata, and program count summaries.`,
    },
    {
      title: "dataset/programs_all.json",
      text: `${formatCount(state.programs.length)} extracted program rows linked to schools by school_id and school_source_id, with Mandarin source names and draft English translations.`,
    },
    {
      title: "dataset/official_school_english_names_moe.csv",
      text: "Ministry of Education open-data source used as the primary official reference for school English names.",
    },
    {
      title: "dataset/admission_info_sections_1_to_6_bilingual.json",
      text: "Bilingual admission guide sections from eligibility through other important notes, with English summaries and expandable original Chinese source text.",
    },
    {
      title: "program_extraction_report.json",
      text: report.total_program_records
        ? `${formatCount(report.total_program_records)} total records, ${formatCount(report.key_industry_program_count)} key industry programs, ${formatCount(report.international_foundation_program_count)} international foundation programs.`
        : "Extraction metadata for program counts and unmatched rows.",
    },
    {
      title: "Official PDF source",
      text: "School and program data come from the Overseas Joint Admissions Committee PDF referenced in the dataset source fields.",
    },
  ];

  qs("#source-list").innerHTML = sourceItems
    .map(
      (source) => `
        <article class="source-item">
          <h3>${escapeHtml(source.title)}</h3>
          <p class="source-meta">${escapeHtml(source.text)}</p>
        </article>
      `,
    )
    .join("");
}

init();
