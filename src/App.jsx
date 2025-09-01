import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadPersisted, savePersisted, hasRemote } from "./persist";

// =============== Minimal UI atoms (no extra props) ===============
const Button = ({ className = "", children, ...props }) => (
  <button
    className={`px-3 py-2 rounded-2xl shadow-sm border border-gray-200 hover:shadow transition disabled:opacity-50 ${className}`}
    {...props}
  >
    {children}
  </button>
);
const Card = ({ className = "", children }) => (
  <div className={`rounded-2xl border border-gray-200 shadow-sm p-4 bg-white ${className}`}>{children}</div>
);
const SectionTitle = ({ children }) => (
  <h2 className="text-xl font-extrabold tracking-tight mb-2 text-gray-900">{children}</h2>
);
const I_OLD = {
  Cal: () => <span aria-hidden>📅</span>,
  DL: () => <span aria-hidden>⬇️</span>,
  List: () => <span aria-hidden>🧾</span>,
  Shuffle: () => <span aria-hidden>🔀</span>,
  Upload: () => <span aria-hidden>📤</span>,
  Print: () => <span aria-hidden>🖨️</span>,
  Link: () => <span aria-hidden>🔗</span>,
  X: () => <span aria-hidden>✖️</span>,
  Plus: () => <span aria-hidden>➕</span>,
  Edit: () => <span aria-hidden>✏️</span>,
};

// Replaced icon set with ASCII-safe symbols (avoid encoding issues)
const I = {
  Cal: () => <span aria-hidden>[Cal]</span>,
  DL: () => <span aria-hidden>[DL]</span>,
  List: () => <span aria-hidden>[List]</span>,
  Shuffle: () => <span aria-hidden>[Shuf]</span>,
  Upload: () => <span aria-hidden>[Up]</span>,
  Print: () => <span aria-hidden>[Print]</span>,
  Link: () => <span aria-hidden>[Link]</span>,
  X: () => <span aria-hidden>[X]</span>,
  Plus: () => <span aria-hidden>[+]</span>,
  Edit: () => <span aria-hidden>[Edit]</span>,
};

// =============== Utilities ===============
function rngFactory(seedStr) {
  let h = 0x811c9dc5;
  const s = String(seedStr || "default");
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) ^ s.charCodeAt(i);
  let x = (h >>> 0) || 0x9e3779b1;
  return function rng() {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function toCsv(rows) {
  if (!rows || !rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\r\n");
}
function toICS(events) {
  const pad = (n) => String(n).padStart(2, "0");
  const dt = (d) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Family Meal Planner//EN"];
  events.forEach((ev, i) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:meal-${i}@familyplanner`);
    lines.push(`DTSTAMP:${dt(new Date())}`);
    lines.push(`DTSTART:${dt(ev.start)}`);
    lines.push(`DTEND:${dt(ev.end)}`);
    lines.push(`SUMMARY:${ev.title}`);
    if (ev.description) lines.push(`DESCRIPTION:${String(ev.description).replace(/\n/g, "\\n").replace(/,/g, " ")}`);
    if (ev.recipeUrl) lines.push(`URL:${ev.recipeUrl}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Ingredient heuristics (heart‑healthy leaning)
function ingredientHeuristics(name) {
  const n = String(name || "").toLowerCase();
  const base = {
    taco: "lean ground turkey, low-sodium taco seasoning, whole-wheat tortillas, lettuce, tomato, onion, cilantro, plain Greek yogurt, lime",
    chili: "lean ground turkey, no-salt-added beans, no-salt-added tomato sauce, onion, bell pepper, chili powder, cumin, garlic",
    chicken: "boneless skinless chicken breast, olive oil, garlic, pepper, dried herbs, lemon",
    salmon: "salmon fillets, lemon, garlic, olive oil, pepper, parsley",
    beef: "extra-lean beef, garlic, onion, pepper, mixed vegetables",
    pork: "pork tenderloin, ginger, garlic, low-sodium soy (or coconut aminos), sesame oil",
    shrimp: "shrimp, garlic, lemon, olive oil, parsley",
    salad: "mixed greens, tomato, cucumber, carrot, red onion, balsamic vinegar, olive oil",
    soup: "low-sodium broth, onion, carrot, celery, garlic, herbs, vegetables",
    stirfry: "chicken breast, broccoli, bell pepper, snap peas, garlic, ginger, low-sodium soy (or coconut aminos), olive oil",
    pasta: "whole-wheat pasta, low-sodium marinara, turkey meatballs, basil",
    meatloaf: "lean ground turkey, egg, onion, rolled oats, no-salt-added tomato sauce",
    burger: "lean ground turkey, whole-grain buns, lettuce, tomato, onion, avocado",
    wrap: "whole-wheat wraps, turkey breast, lettuce, tomato, hummus",
    lentil: "lentils, low-sodium broth, onion, carrot, celery, garlic, tomatoes",
    quinoa: "quinoa, low-sodium broth, mixed vegetables, lemon",
    casserole: "brown rice or whole-wheat pasta, chicken breast, broccoli, low-fat yogurt, herbs",
    lasagna: "whole-wheat lasagna, low-fat ricotta, turkey, low-sodium marinara, spinach",
    pizza: "whole-wheat crust, low-sodium marinara, part-skim mozzarella, mushrooms, peppers",
    mac: "whole-wheat pasta, low-fat milk, reduced-fat cheese, cauliflower puree (optional)",
    burrito: "brown rice, black beans (rinsed), turkey, corn, tomato, lettuce, salsa (no-salt-added)",
    tuna: "canned tuna in water, Greek yogurt, celery, dill, lemon, whole-wheat wraps",
    pancake: "whole-wheat flour, baking powder, egg, low-fat milk, fruit topping",
    egg: "eggs, spinach, tomato, olive oil, pepper",
  };
  if (n.includes("taco")) return base.taco;
  if (n.includes("chili")) return base.chili;
  if (n.includes("salmon")) return base.salmon;
  if (n.includes("meatloaf")) return base.meatloaf;
  if (n.includes("stir-fry") || n.includes("stir fry")) return base.stirfry;
  if (n.includes("pasta") || n.includes("spaghetti") || n.includes("zoodles")) return base.pasta;
  if (n.includes("lasagna")) return base.lasagna;
  if (n.includes("burger")) return base.burger;
  if (n.includes("wrap")) return base.wrap;
  if (n.includes("lentil")) return base.lentil;
  if (n.includes("quinoa")) return base.quinoa;
  if (n.includes("casserole")) return base.casserole;
  if (n.includes("pizza")) return base.pizza;
  if (n.includes("mac")) return base.mac;
  if (n.includes("burrito")) return base.burrito;
  if (n.includes("tuna")) return base.tuna;
  if (n.includes("pancake")) return base.pancake;
  if (n.includes("egg")) return base.egg;
  if (n.includes("pork")) return base.pork;
  if (n.includes("shrimp")) return base.shrimp;
  if (n.includes("soup")) return base.soup;
  if (n.includes("salad")) return base.salad;
  if (n.includes("beef")) return base.beef;
  if (n.includes("chicken")) return base.chicken;
  return "lean protein, vegetables, olive oil, garlic, pepper, herbs";
}
function inferMealType(name) {
  const n = String(name || "").toLowerCase();
  if (["egg", "pancake", "waffle", "muffin", "oatmeal", "parfait", "yogurt"].some((k) => n.includes(k))) return "Breakfast";
  if (["salad", "sandwich", "wrap", "soup", "bowl"].some((k) => n.includes(k))) return "Lunch";
  return "Dinner";
}
const ING_CATEGORIES = {
  Proteins: ["chicken", "turkey", "beef", "pork", "salmon", "shrimp", "tuna", "ham", "egg"],
  "Grains & Staples": ["rice", "quinoa", "pasta", "tortilla", "bread", "bun", "oat", "couscous", "farro", "lasagna", "noodle"],
  "Vegetables & Fruits": [
    "lettuce", "tomato", "onion", "garlic", "pepper", "broccoli", "spinach", "kale", "zucchini", "carrot",
    "apple", "lemon", "lime", "berry", "asparagus", "potato", "sweet"
  ],
  "Dairy & Eggs": ["milk", "yogurt", "cheese", "mozzarella", "ricotta", "egg"],
  Pantry: ["oil", "olive", "spice", "oregano", "basil", "cumin", "chili", "salsa", "sauce", "tomato", "broth", "beans", "flour"],
};
function categorize(item) {
  const it = String(item || "").toLowerCase();
  for (const [cat, keys] of Object.entries(ING_CATEGORIES)) if (keys.some((k) => it.includes(k))) return cat;
  return "Other";
}
function STARTING_DEFAULT() {
  const today = new Date();
  const day = today.getDay();
  const delta = ((8 - day) % 7) || 7; // next Monday
  const nextMon = new Date(today);
  nextMon.setDate(today.getDate() + delta);
  nextMon.setHours(0, 0, 0, 0);
  return nextMon.toISOString().slice(0, 10);
}

// =============== Defaults & theme ===============
const DEFAULTS = {
  dinnersOnly: true,
  dinnerHour: 18,
  dinnerMinutes: 0,
  maxRepeatAcross4Weeks: 2,
  cooks: [
    { id: "A", name: "Stacey", availability: { mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true }, availabilityWeeks: {} },
    { id: "B", name: "Sharon", availability: { mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true }, availabilityWeeks: {} }
  ],
};
// Stacey (A) back to blue hue
const COOK_COLORS = {
  A: { chip: "bg-blue-100 text-blue-800 border-blue-200", text: "text-blue-700", border: "border-blue-300" },
  B: { chip: "bg-violet-100 text-violet-700 border-violet-200", text: "text-violet-700", border: "border-violet-300" },
  default: { chip: "bg-sky-100 text-sky-700 border-sky-200", text: "text-sky-700", border: "border-sky-300" },
};
const cookStyle = (id) => COOK_COLORS[id] || COOK_COLORS.default;
const cookClass = (id) => (id === "A" ? "cookA" : id === "B" ? "cookB" : "cookDefault");

// =============== App ===============
export default function MealPlannerApp() {
  const [meals, setMeals] = useState([]);
  const [threshold, setTextThreshold] = useState(3);
  const [mode, setMode] = useState("dinners");
  const [seed, setSeed] = useState("");
  const [startDate, setStartDate] = useState(STARTING_DEFAULT());
  const [weeks, setWeeks] = useState(() => generateEmptyWeeks());
  const [activeWeek, setActiveWeek] = useState(0);
  const [repeatCap, setRepeatCap] = useState(DEFAULTS.maxRepeatAcross4Weeks);
  const [cooks, setCooks] = useState(DEFAULTS.cooks);
  const [gScope, setGScope] = useState("all");
  const [showEditor, setShowEditor] = useState(false);
  const [recipeModal, setRecipeModal] = useState({ open: false, meal: null });
  const [addModal, setAddModal] = useState({ open: false, meal: { name: "", avg: 7, type: "Dinner", ingredients: "", recipeUrl: "" } });
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [exportWeeks, setExportWeeks] = useState([]);

  const csvInputRef = useRef(null);
  const xlsInputRef = useRef(null);
  const autosaveDebounceRef = useRef();
  const didPromptRestoreRef = useRef(false);
  const [nowTs, setNowTs] = useState(Date.now());

  const cookName = (id) => cooks.find((c) => c.id === id)?.name || id;
  // Lightweight ticker so the "Saved x min ago" text updates
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  // Sample data so UI isn't empty
  useEffect(() => {
    if (meals.length) return;
    const sample = [
      { name: "Veggie pizza (whole-wheat crust, low-fat cheese)", avg: 7.1 },
      { name: "Pot roast (lean) with whole-grain rolls and greens", avg: 7.4 },
      { name: "Turkey burgers with baked sweet potato fries and salad", avg: 7.9 },
      { name: "Burrito bowls (turkey, black beans, brown rice)", avg: 7.1 },
      { name: "Grilled salmon with quinoa and asparagus", avg: 8.0 },
      { name: "Whole-wheat pasta with turkey meatballs, zucchini", avg: 7.6 },
      { name: "Turkey chili (low-sodium), brown rice, corn", avg: 7.6 },
      { name: "Caprese salad with grilled chicken, whole-grain pasta", avg: 7.2 },
      { name: "Chicken and wild rice casserole, green beans", avg: 7.1 },
      { name: "Minestrone soup (low-sodium), whole-grain bread", avg: 7.1 },
    ].map((m) => ({ ...m, type: inferMealType(m.name), ingredients: ingredientHeuristics(m.name), recipeUrl: "" }));
    setMeals(ensureIds(sample));
  }, [meals.length]);

  const filteredMeals = useMemo(() => meals.filter((m) => (Number(m.avg) || 0) >= threshold), [meals, threshold]);

  // Upload handlers
  async function handleCSV(file) {
    try {
      const Papa = (await import("papaparse")).default;
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = res.data || [];
          const parsed = parseUploadedRows(rows);
          if (!parsed.length) return alert("Could not detect meal data in CSV.");
          setMeals(ensureIds(parsed));
        },
      });
    } catch (e) {
      console.warn("CSV parser not available", e);
      alert("CSV parser not available here. Try Excel instead.");
    }
  }
  async function handleExcel(file) {
    try {
      const XLSX = (await import("xlsx")).default;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("sheet2")) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const parsed = parseUploadedRows(rows);
      if (!parsed.length) return alert("Could not detect meal data in Excel sheet.");
      setMeals(ensureIds(parsed));
    } catch (e) {
      console.warn("Excel parser not available", e);
      alert("Excel parser not available here. Try CSV instead.");
    }
  }

  function parseUploadedRows(rows) {
    const out = [];
    for (const r of rows || []) {
      const name = r["Meal Name"] || r["name"] || r["Dish"] || r["dish"];
      if (!name) continue;
      let avg = Number(r["Average Score"]);
      if (!avg || isNaN(avg)) {
        const keys = Object.keys(r);
        const voteKeys = keys.filter((k) => k !== "Dish" && k !== "Total Score" && k !== "Meal Name" && (/^.*@.*\..*$/.test(k) || /score/i.test(k)));
        const votes = voteKeys.map((k) => Number(r[k])).filter((v) => !isNaN(v));
        if (votes.length) avg = votes.reduce((a, b) => a + b, 0) / votes.length;
        else if (Number(r["Total Score"])) avg = Number(r["Total Score"]) / 6; else avg = 3;
      }
      const type = r["Meal Type"] || inferMealType(name);
      const ingredients = r["Ingredients"] || ingredientHeuristics(name);
      const recipeUrl = r["Recipe URL"] || r["Recipe"] || r["URL"] || "";
      out.push({ name: String(name).trim(), avg: Number(avg), type, ingredients, recipeUrl: String(recipeUrl || "").trim() });
    }
    return out;
  }

  // Planning
function generateEmptyWeeks() {
  const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return Array.from({ length: 4 }, () => labels.map((l, i) => ({ label: l, weekday: WEEKDAYS[i] })));
}
  function generateWithConstraints(pool, { dinnersOnly = DEFAULTS.dinnersOnly, seed = "", maxRepeatAcross4Weeks = DEFAULTS.maxRepeatAcross4Weeks, cookIds = ["A", "B"], cooksList = cooks }) {
    const rng = rngFactory(seed || "default");
    const weeksLocal = generateEmptyWeeks();
    const counts = Object.create(null);
    const recentByName = [];
    const RECENT_SIZE = 8;
    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 7; d++) {
        const prevDay = d > 0 ? weeksLocal[w][d - 1] : null;
        // Candidate pool
        let candidates = pool.filter((m) => (!dinnersOnly || (m.type || inferMealType(m.name)) === "Dinner") && (counts[m.name] || 0) < maxRepeatAcross4Weeks);
        if (!candidates.length) candidates = pool.filter((m) => !dinnersOnly || (m.type || inferMealType(m.name)) === "Dinner");
        if (!candidates.length) candidates = [...pool];
        // Weighting
        const weighted = candidates.map(m => {
          let weight = (Number(m.avg) || 0) * 100;
          if (recentByName.includes(m.name)) weight -= 100;
          if (prevDay && prevDay.d && prevDay.d.name === m.name) weight -= 50;
          return { meal: m, weight };
        });
        weighted.sort((a, b) => b.weight - a.weight);
        // Pick randomly among top 6
        const top = weighted.slice(0, 6);
        const pickIdx = Math.floor(rng() * top.length);
        let dinner = top[pickIdx]?.meal || candidates[Math.floor(rng() * candidates.length)];
        // Avoid immediate adjacency if possible
        if (prevDay && prevDay.d && prevDay.d.name === (dinner && dinner.name) && top.length > 1) {
          dinner = top.find(x => x.meal.name !== prevDay.d.name)?.meal || dinner;
        }
        if (!dinner || !dinner.name) {
          dinner = candidates[0] || pool[0];
          if (!dinner) continue;
        }
        weeksLocal[w][d].d = dinner;
        counts[dinner.name] = (counts[dinner.name] || 0) + 1;
        // Update recent queue
        recentByName.push(dinner.name);
        if (recentByName.length > RECENT_SIZE) recentByName.shift();
        // Cook assignment with availability
        const weekdayKey = weeksLocal[w][d].weekday;
        // Only include cooks available for this week and day
        const availableCooks = cooksList.filter(c =>
          (c.availabilityWeeks ? c.availabilityWeeks[w] !== false : true) &&
          c.availability && c.availability[weekdayKey]
        );
        const ids = availableCooks.length ? availableCooks.map(c => c.id) : cooksList.map(c => c.id);
        weeksLocal[w][d].cook = ids[(d + w) % ids.length];
        // ...existing code for breakfast/lunch if needed...
      }
    }
    return weeksLocal;
  }
  function assignDatesToWeeks(weeksIn, startDateStr, hour = DEFAULTS.dinnerHour, minutes = DEFAULTS.dinnerMinutes) {
    try {
      const base = new Date(startDateStr);
      if (isNaN(base.getTime())) return weeksIn;
      // Ensure base is Monday 00:00 local
      base.setHours(0, 0, 0, 0);
      const out = weeksIn.map((week, wIdx) => week.map((day, dIdx) => {
        const dt = new Date(base);
        dt.setDate(base.getDate() + wIdx * 7 + dIdx);
        dt.setHours(hour, minutes, 0, 0);
        return { ...day, date: dt };
      }));
      return out;
    } catch {
      return weeksIn;
    }
  }
  function fillWeeks({ dinnersOnly = DEFAULTS.dinnersOnly } = {}) {
    const pool = [...filteredMeals];
    if (!pool.length) return alert("No meals available above threshold.");
    const ids = cooks.map((c) => c.id);
    const filled = generateWithConstraints(pool, { dinnersOnly, seed, maxRepeatAcross4Weeks: repeatCap, cookIds: ids.length ? ids : ["A"] });
    setWeeks(assignDatesToWeeks(filled, startDate));
  }
  function shuffleWeeks() { fillWeeks({ dinnersOnly: mode === "dinners" }); }

  function computeGroceryFromDays(days) {
    const items = [];
    const pushIng = (meal) => {
      if (!meal || !meal.ingredients) return;
      String(meal.ingredients).split(',').forEach((raw) => { const t = raw.trim(); if (t) items.push(t); });
    };
    days.forEach((day) => { pushIng(day.b); pushIng(day.l); pushIng(day.d); });
    const tally = {};
    for (const i of items) tally[i.toLowerCase()] = (tally[i.toLowerCase()] || 0) + 1;
    const entries = Object.entries(tally).map(([name, count]) => ({ name, count, category: categorize(name) }));
    entries.sort((a, b) => a.category.localeCompare(b.category) || b.count - a.count || a.name.localeCompare(b.name));
    return entries;
  }
  function currentWeekGrocery(filterCookId) {
    const week = weeks[activeWeek];
    const days = filterCookId ? week.filter((d) => d.cook === filterCookId) : week;
    return computeGroceryFromDays(days);
  }
  function buildEventDescription(dinner) {
    const base = `Family dinner: ${dinner?.ingredients || ''}`;
    const urlPart = dinner?.recipeUrl ? `\nRecipe: ${dinner.recipeUrl}` : '';
    return base + urlPart;
  }
  function downloadICS() {
    const selectedWeeks = exportWeeks.length ? exportWeeks : weeks.map((_, i) => i);
    const events = [];
    selectedWeeks.forEach(wIdx => {
      weeks[wIdx].forEach(day => {
        if (day.d) {
          events.push({
            title: `${day.d.name} (Cook ${cookName(day.cook || 'A')})`,
            start: day.date,
            end: day.date,
            description: buildEventDescription(day.d),
            recipeUrl: day.d.recipeUrl || ''
          });
        }
      });
    });
    const ics = toICS(events);
    downloadFile('family-meal-plan.ics', ics, 'text/calendar;charset=utf-8');
  }
  function downloadWeekCSV() {
    const week = weeks[activeWeek];
    const rows = week.map((d) => ({ Day: d.label, Breakfast: (d.b && d.b.name) || '', Lunch: (d.l && d.l.name) || '', Dinner: (d.d && d.d.name) || '', Cook: cookName(d.cook) || '', Recipe: (d.d && d.d.recipeUrl) || '' }));
    downloadFile(`week-${activeWeek + 1}-plan.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  }
  function downloadGroceryCSV(filterCookId) {
    const entries = currentWeekGrocery(filterCookId);
    const rows = entries.map((e) => ({ Category: e.category, Item: e.name, Count: e.count }));
    const suffix = filterCookId ? `cook-${filterCookId.toLowerCase()}` : 'all';
    downloadFile(`week-${activeWeek + 1}-grocery-${suffix}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  }
  function printPDF() { window.print(); }

  // Auto-fill once after meals load / cooks change
  useEffect(() => { if (!weeks[0][0].d) fillWeeks({ dinnersOnly: DEFAULTS.dinnersOnly }); }, [meals.length, repeatCap, cooks.length]);
  // Update dates when startDate changes
  useEffect(() => {
    setWeeks(prev => assignDatesToWeeks(prev, startDate));
  }, [startDate]);

  // === AUTOSAVE HELPERS ===
  const AUTOSAVE_KEY = "familyMealPlannerAutosave"; // kept for reference in UI only
  async function saveAutosave(state) {
    const minimal = {
      meals: state.meals,
      weeks: state.weeks,
      cooks: state.cooks,
      startDate: state.startDate,
      repeatCap: state.repeatCap,
      threshold: state.threshold,
      mode: state.mode,
      seed: state.seed,
    };
    try {
      await savePersisted(minimal);
      setLastSavedAt(Date.now());
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 1200);
    } catch {}
  }
  async function loadAutosave() {
    try { return await loadPersisted(); } catch { return null; }
  }

  // Prompt to restore autosave on first mount
  useEffect(() => {
    if (didPromptRestoreRef.current) return;
    didPromptRestoreRef.current = true;
    (async () => {
      const saved = await loadAutosave();
      if (saved) {
        setMeals(saved.meals || []);
        setWeeks(saved.weeks || generateEmptyWeeks());
        setCooks(saved.cooks || DEFAULTS.cooks);
        setStartDate(saved.startDate || STARTING_DEFAULT());
        setRepeatCap(saved.repeatCap ?? DEFAULTS.maxRepeatAcross4Weeks);
        setTextThreshold(saved.threshold ?? 3);
        setMode(saved.mode || "dinners");
        setSeed(saved.seed || "");
      }
    })();
  }, []);
  // Debounced autosave on relevant state changes
  useEffect(() => {
    if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
    autosaveDebounceRef.current = setTimeout(() => {
      saveAutosave({ meals, weeks, cooks, startDate, repeatCap, threshold, mode, seed });
    }, 400);
    return () => clearTimeout(autosaveDebounceRef.current);
  }, [meals, weeks, cooks, startDate, repeatCap, threshold, mode, seed]);
  // Helper to trigger autosave immediately
  function triggerAutosave() {
    saveAutosave({ meals, weeks, cooks, startDate, repeatCap, threshold, mode, seed });
  }
  function savedLabel(ts) {
    if (!ts) return '';
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 10) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  // Cook list mgmt
  function addCook() {
    const nextId = String.fromCharCode(65 + cooks.length);
    setCooks(prev => {
      const updated = [
        ...prev,
        {
          id: nextId,
          name: "",
          availability: { mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true },
          availabilityWeeks: { 0: { mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true } },
        },
      ];
      return updated;
    });
    setTimeout(() => {
      fillWeeks({ dinnersOnly: DEFAULTS.dinnersOnly });
      setTimeout(triggerAutosave, 100);
    }, 0);
  }
  function removeCook(id) {
    if (cooks.length <= 1) return;
    setCooks((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      setTimeout(triggerAutosave, 0);
      return updated;
    });
  }

  // Ensure all cooks have full default availability
  useEffect(() => {
    setCooks(prev => prev.map(c => ({
      ...c,
      availability: {
        mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true
      },
      availabilityWeeks: Object.keys(c.availabilityWeeks || {}).length > 0
        ? c.availabilityWeeks
        : { 0: { mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true } }
    })));
  }, []);

  const [mealSearch, setMealSearch] = useState("");
  // Meals Editor state (moved up to avoid TDZ when showEditor is true)
  const [localMeals, setLocalMeals] = useState(meals);
  const [dirtyMeals, setDirtyMeals] = useState(false);
  // Stable IDs for meals so edits persist under sorting/filtering
  const idCounterRef = useRef(0);
  function ensureIds(list) {
    return (list || []).map((m) => (m && m._id ? m : { ...m, _id: `m${idCounterRef.current++}` }));
  }
  // 1. Add missing Meals Editor handlers and sortedFilteredMeals
  function handleEditMeal(idOrIdx, key, value) {
    setLocalMeals(prev => {
      const updated = prev.map((m, i) => (m._id === idOrIdx || i === idOrIdx) ? { ...m, [key]: value } : m);
      const nextMeals = ensureIds(updated);
      setMeals(nextMeals);
      // Immediate autosave of edits so they persist across reloads
      try { saveAutosave({ meals: nextMeals, weeks, cooks, startDate, repeatCap, threshold, mode, seed }); } catch {}
      return updated;
    });
    setDirtyMeals(true);
  }
  function handleInferIngredients(idOrIdx) {
    setLocalMeals(prev => {
      const updated = prev.map((m, i) => (m._id === idOrIdx || i === idOrIdx) ? { ...m, ingredients: ingredientHeuristics(m.name) } : m);
      const nextMeals = ensureIds(updated);
      setMeals(nextMeals);
      try { saveAutosave({ meals: nextMeals, weeks, cooks, startDate, repeatCap, threshold, mode, seed }); } catch {}
      return updated;
    });
    setDirtyMeals(true);
  }
  function handleSort(key) {
    setSortKey(key);
    setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
  }
  function handleDeleteMeal(idOrIdx) {
    setLocalMeals(prev => {
      const updated = prev.filter((m, i) => !(m._id === idOrIdx || i === idOrIdx));
      const nextMeals = ensureIds(updated);
      setMeals(nextMeals);
      try { saveAutosave({ meals: nextMeals, weeks, cooks, startDate, repeatCap, threshold, mode, seed }); } catch {}
      return updated;
    });
    setDirtyMeals(true);
  }
  function handleSaveMeals() {
    // Ensure meals have stable IDs, then persist
    const withIds = ensureIds(localMeals);
    setMeals(withIds);
    // Build map by _id for robust syncing (fallback to name)
    const idMap = new Map(withIds.map(m => [m._id, m]));
    const updatedWeeks = (prev => prev.map(week => week.map(day => {
      const sync = (meal) => {
        if (!meal) return meal;
        const updated = (meal._id && idMap.get(meal._id)) || withIds.find(m => m.name === meal.name);
        return updated ? { ...meal, ...updated } : meal;
      };
      return { ...day, b: sync(day.b), l: sync(day.l), d: sync(day.d) };
    })))(weeks);
    setWeeks(updatedWeeks);
    setDirtyMeals(false);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
    // Immediately persist the latest snapshot
    try {
      saveAutosave({ meals: withIds, weeks: updatedWeeks, cooks, startDate, repeatCap, threshold, mode, seed });
    } catch {}
  }
  function handleDiscardMeals() {
    setLocalMeals(meals);
    setDirtyMeals(false);
  }
  function handleAddMeal() {
    setLocalMeals(prev => {
      const updated = [
        ...prev,
        { _id: `m${idCounterRef.current++}`, name: "New meal", avg: 3, type: "Dinner", ingredients: "", recipeUrl: "" }
      ];
      const nextMeals = ensureIds(updated);
      setMeals(nextMeals);
      try { saveAutosave({ meals: nextMeals, weeks, cooks, startDate, repeatCap, threshold, mode, seed }); } catch {}
      return updated;
    });
    setDirtyMeals(true);
  }
  function isValidUrl(u) {
    try {
      const x = new URL(String(u || "").trim());
      return x.protocol === "http:" || x.protocol === "https:";
    } catch {
      return false;
    }
  }
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [isMobile, setIsMobile] = useState(false);
  const sourceMeals = showEditor ? localMeals : meals;
  const sortedFilteredMeals = sourceMeals
    .filter(m => m.name.toLowerCase().includes(mealSearch.toLowerCase()) || (m.type && m.type.toLowerCase().includes(mealSearch.toLowerCase())))
    .sort((a, b) => {
      if (!sortKey) return 0;
      if (sortDir === 'asc') return String(a[sortKey]).localeCompare(String(b[sortKey]));
      return String(b[sortKey]).localeCompare(String(a[sortKey]));
    });

  // Meals Editor state fixes

  // When meals change, ensure IDs and update localMeals for discard
  useEffect(() => { setLocalMeals(ensureIds(meals)); }, [meals]);

  // Track small screens for a friendlier mobile editor
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const cb = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', cb); else mq.addListener(cb);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', cb); else mq.removeListener(cb); };
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 p-4">
  <div className="max-w-7xl mx-auto space-y-6 w-full px-2 md:px-0">
          {/* Header */}
          <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 w-full px-2 md:px-0">
            <div>
              <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-gray-900 leading-tight">Family Meal Planner</h1>
              <p className="text-xs md:text-base text-gray-600">
                4-week rotation • dinners at 6:00 PM<br className="md:hidden" />
                <span className="block md:inline">{cooks.map(c => c.name).join(' & ')}</span>
              </p>
            </div>
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto items-stretch md:items-center">
              <Button className="bg-gray-900 text-white hover:opacity-90 w-full md:w-auto min-h-[44px] text-base" onClick={printPDF}><I.Print/> <span className="ml-1">Print / Save PDF</span></Button>
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700 w-full md:w-auto min-h-[44px] text-base" onClick={downloadICS}><I.Cal/> <span className="ml-1">Export Dinners (.ics)</span></Button>
              <div className="flex items-center justify-between md:justify-start gap-2 w-full md:w-auto">
                <Button className="bg-white text-gray-700 border border-gray-300 w-full md:w-auto min-h-[44px]" onClick={triggerAutosave}><I.DL/> Save now</Button>
                {!!lastSavedAt && (
                  <span className="text-xs md:text-sm text-gray-600 whitespace-nowrap">Saved {savedLabel(lastSavedAt)}</span>
                )}
              </div>
            </div>
          </header>

          {/* Planner */}
          <Card className="w-full max-w-md md:max-w-3xl mx-auto px-2 md:px-6">
            <SectionTitle>4-Week Plan</SectionTitle>
            <div className="flex flex-wrap items-center gap-2 mb-3 w-full overflow-x-auto">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium mr-2">View week:</span>
                <div className="inline-flex rounded-xl border overflow-hidden bg-white w-full md:w-auto">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <button
                      key={i}
                      aria-label={`Switch to Week ${i + 1}`}
                      title={`Show Week ${i + 1} plan`}
                      className={`px-4 py-2 text-base font-semibold min-h-[44px] w-full md:w-auto focus:outline-none transition border-r last:border-r-0 ${activeWeek === i ? 'border-2 border-blue-600 bg-blue-100 text-blue-900' : 'border border-gray-200 text-gray-500 bg-white'} ${i === 0 ? 'rounded-l-xl' : ''} ${i === 3 ? 'rounded-r-xl' : ''}`}
                      style={{ minWidth: 80 }}
                      onClick={() => setActiveWeek(i)}
                    >Week {i + 1}</button>
                  ))}
                </div>
              </div>
              {/* Start date and Repeat cap chips */}
              <div className="ml-4 flex gap-2 items-center">
                <span className="px-3 py-2 rounded bg-sky-50 border border-sky-300 text-sm font-semibold text-sky-900 shadow-sm" style={{ minWidth: 120 }}>
                  Start date: <span className="font-bold">{startDate}</span>
                </span>
                <span className="px-3 py-2 rounded bg-sky-50 border border-sky-300 text-sm font-semibold text-sky-900 shadow-sm" style={{ minWidth: 120 }}>
                  Repeat cap: <span className="font-bold">{repeatCap}</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {weeks[activeWeek].map((day, idx) => (
                  <div key={idx} className={`day-card rounded-2xl border border-gray-200 overflow-hidden ${cookClass(day.cook)}`}>
                    <div className="bg-gray-50 px-3 py-2 flex justify-between items-center">
                      <div className="font-semibold text-gray-900">{day.label}</div>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${cookStyle(day.cook).chip}`}>{cookName(day.cook)}</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {mode === 'all' && (
                        <div className="bg-yellow-50 rounded-lg p-2">
                          <div className="text-xs text-gray-600">Breakfast</div>
                          <div className="font-medium">{(day.b && day.b.name) || '—'}</div>
                        </div>
                      )}
                      {mode === 'all' && (
                        <div className="bg-blue-50 rounded-lg p-2">
                          <div className="text-xs text-gray-600">Lunch</div>
                          <div className="font-medium">{(day.l && day.l.name) || '—'}</div>
                        </div>
                      )}
                      <div className="rounded-lg p-2 day-body">
                        <div className="text-xs text-gray-600 flex items-center gap-2">Dinner
                          <button
                            className="ml-2 px-2 py-1 rounded hover:bg-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                            title="Edit or Replace Dinner"
                            aria-label="Edit or Replace Dinner"
                            tabIndex={0}
                            style={{ lineHeight: 1, minWidth: 40, minHeight: 40 }}
                            onClick={() => setRecipeModal({ open: true, meal: day.d || null, dayIndex: idx, weekIndex: activeWeek })}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setRecipeModal({ open: true, meal: day.d || null, dayIndex: idx, weekIndex: activeWeek }); } }}
                          >🔄</button>
                          <span className="ml-2 text-xs text-gray-500">Edit, Replace, or Add recipe and link.</span>
                        </div>
                        <button className="meal-title w-full text-left" onClick={() => setRecipeModal({ open: true, meal: day.d || null, dayIndex: idx, weekIndex: activeWeek })}>{(day.d && day.d.name) || '—'}</button>
                        <div className="meal-ingredients mt-2">{(day.d && day.d.ingredients) || ''}</div>
                        {!!(day.d && day.d.recipeUrl) && (
                          <div className="text-xs mt-1"><a className="underline" target="_blank" rel="noreferrer" href={day.d.recipeUrl}>Open saved recipe</a></div>
                        )}
                        {/* Star rating for this meal instance */}
                        {day.d && (
                          <div className="flex flex-col items-center mt-2">
                            <div className="flex gap-1">
                              {[1,2,3,4,5].map(star => (
                                <button key={star} className={`text-base ${day.d.rating >= star ? 'text-yellow-500' : 'text-gray-400'} transition-colors`} style={{ padding: '2px 6px' }} onClick={() => {
                                  setWeeks(prev => prev.map((week, wIdx) => wIdx === activeWeek ? week.map((d, dIdx) => dIdx === idx ? { ...d, d: { ...d.d, rating: star } } : d) : week));
                                  setMeals(prev => prev.map(m => m.name === day.d.name ? { ...m, rating: star } : m));
                                }} aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}>{day.d.rating >= star ? '★' : '☆'}</button>
                              ))}
                            </div>
                            <span className="text-xs text-gray-500 mt-1">Rate this meal</span>
                            {/* Search and Replace meal dropdown */}
                            <div className="mt-2 w-full flex flex-col items-center">
                              <input
                                type="text"
                                className="border rounded px-2 py-1 w-full max-w-xs mb-2"
                                placeholder="Search meals..."
                                value={mealSearch}
                                onChange={e => setMealSearch(e.target.value)}
                              />
                              <label className="block text-xs font-medium text-gray-700 mb-1">Replace meal:</label>
                              <select className="border rounded px-2 py-1 w-full max-w-xs" value={day.d.name} onChange={e => {
                                const newName = e.target.value;
                                const newMeal = meals.find(m => m.name === newName);
                                setWeeks(prev => prev.map((week, wIdx) => wIdx === activeWeek ? week.map((d, dIdx) => dIdx === idx ? { ...d, d: { ...newMeal } } : d) : week));
                              }}>
                                <option value="">-- Select meal --</option>
                                {meals.filter(m => m.name.toLowerCase().includes(mealSearch.toLowerCase())).map((m, i) => (<option key={i} value={m.name}>{m.name}</option>))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          </Card>

          {/* Meals editor (moved above Cooks) */}
          <Card className="bg-gray-50 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900">Meals Editor</div>
              <Button onClick={() => setShowEditor((v) => !v)}><I.Edit/> <span className="ml-1">{showEditor ? 'Hide' : 'Edit'} meals</span></Button>
            </div>
            <div className="text-sm text-gray-600 mb-2">Add, edit, or remove meals from the planner. Chefs: use this to update the menu, set ratings, add ingredients, and link recipes. Changes here affect the weekly plan and grocery list.</div>
            {/* Search/filter input and Add meal button */}
            {showEditor && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Search by name or type..."
                  value={mealSearch || ''}
                  onChange={e => setMealSearch(e.target.value)}
                  className="border rounded-xl px-3 py-2 w-full sm:w-64 shadow-sm bg-white text-gray-900 focus:ring-2 focus:ring-sky-500"
                />
                <Button className="bg-sky-500 text-white hover:bg-sky-600" onClick={() => setAddModal({ open: true, meal: { name: "", avg: 7, type: "Dinner", ingredients: "", recipeUrl: "" } })}><I.Plus/> Add meal</Button>
              </div>
            )}
            {/* Mobile card editor */}
            {showEditor && isMobile && (
              <div className="space-y-3">
                {sortedFilteredMeals.map((m, idx) => (
                  <div key={m._id || idx} className="border rounded-2xl p-3 bg-white shadow-sm">
                    <div className="text-xs text-gray-500 mb-1">Meal</div>
                    <input value={m.name} onChange={e => handleEditMeal(m._id, 'name', e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-2" placeholder="Meal name" />
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Avg</div>
                        <input type="number" step="0.1" min="0" max="10" value={m.avg} onChange={e => handleEditMeal(m._id, 'avg', e.target.value)} className="w-full border rounded-xl px-2 py-2 text-center" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Type</div>
                        <select value={m.type || 'Dinner'} onChange={e => handleEditMeal(m._id, 'type', e.target.value)} className="w-full border rounded-xl px-2 py-2 bg-white">
                          <option>Breakfast</option><option>Lunch</option><option>Dinner</option>
                        </select>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mb-1">Ingredients</div>
                    <textarea rows={4} value={m.ingredients || ''} onChange={e => handleEditMeal(m._id, 'ingredients', e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-2" placeholder="Comma-separated items" />
                    <div className="flex justify-between items-center mb-2">
                      <Button type="button" className="bg-white" onClick={() => handleInferIngredients(m._id)}>Infer</Button>
                      <div className="flex gap-1 items-center">
                        {[1,2,3,4,5].map(star => (
                          <button key={star} className={`text-xl ${m.rating >= star ? 'text-yellow-500' : 'text-gray-400'}`} onClick={() => handleEditMeal(m._id, 'rating', star)}>★</button>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mb-1">Recipe URL</div>
                    <input value={m.recipeUrl || ''} onChange={e => handleEditMeal(m._id, 'recipeUrl', e.target.value)} placeholder="https://..." className="w-full border rounded-xl px-3 py-2 mb-2" />
                    <div className="flex justify-end">
                      <Button type="button" className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200" title="Delete meal" onClick={() => handleDeleteMeal(m._id)}><I.X/> Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Desktop/tablet editor */}
            {showEditor && !isMobile && (
              <div className="overflow-auto max-h-[420px] border rounded-xl shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-gradient-to-r from-pink-50 to-sky-50 text-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left p-3 cursor-pointer font-semibold" onClick={() => handleSort('name')}>Meal {sortKey==='name' ? (sortDir==='asc' ? '▲' : '▼') : ''}</th>
                      <th className="text-left p-3 cursor-pointer font-semibold" onClick={() => handleSort('avg')}>Avg {sortKey==='avg' ? (sortDir==='desc' ? '▼' : '▲') : ''}</th>
                      <th className="text-left p-3 cursor-pointer font-semibold" onClick={() => handleSort('type')}>Type</th>
                      <th className="text-left p-3 font-semibold">Ingredients</th>
                      <th className="text-left p-3 font-semibold">Recipe</th>
                      <th className="text-left p-3 font-semibold">Rating</th>
                      <th className="text-left p-3 font-semibold">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFilteredMeals.map((m, idx) => (
                      <tr key={m._id || idx} className="border-t odd:bg-white even:bg-gray-50 hover:bg-sky-50/60">
                        <td className="p-3 text-gray-900 font-medium min-w-[320px] lg:min-w-[380px]">
                          <input value={m.name} placeholder="e.g., Turkey chili (low-sodium)" onChange={e => handleEditMeal(m._id, 'name', e.target.value)} className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500" />
                        </td>
                        <td className="p-3 w-[88px]">
                          <input type="number" step="0.1" min="0" max="10" value={m.avg} onChange={e => handleEditMeal(m._id, 'avg', e.target.value)} className="w-20 border rounded-lg px-2 py-2 text-center bg-white text-gray-900 focus:ring-2 focus:ring-sky-500" />
                        </td>
                        <td className="p-3 min-w-[120px] sm:min-w-[160px]">
                          <select value={m.type || 'Dinner'} onChange={e => handleEditMeal(m._id, 'type', e.target.value)} className="border rounded-lg px-2 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500">
                            <option>Breakfast</option><option>Lunch</option><option>Dinner</option>
                          </select>
                        </td>
                        <td className="p-3 min-w-[360px] lg:min-w-[480px]">
                          <div className="flex gap-2 items-start">
                            <textarea
                              rows={4}
                              value={m.ingredients || ''}
                               onChange={e => handleEditMeal(m._id, 'ingredients', e.target.value)}
                              className="w-full border rounded-lg px-3 py-2 min-h-[96px] md:min-h-[120px] resize-none leading-snug bg-white text-gray-900 focus:ring-2 focus:ring-sky-500"
                              placeholder="Comma-separated: lean turkey, beans, tomato, onion"
                            />
                            <Button type="button" className="bg-white" title="Suggest from meal name" onClick={() => handleInferIngredients(m._id)}>Infer</Button>
                          </div>
                        </td>
                        <td className="p-3 min-w-[220px]">
                          <input value={m.recipeUrl || ''} placeholder="https://example.com/healthy-recipe" onChange={e => handleEditMeal(m._id, 'recipeUrl', e.target.value)} className={`w-full border rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500 ${m.recipeUrl && !isValidUrl(m.recipeUrl) ? 'border-yellow-400 bg-yellow-50' : ''}`} />
                          {m.recipeUrl && !isValidUrl(m.recipeUrl) && <div className="text-xs text-yellow-700 mt-1">URL may be invalid</div>}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 items-center">
                            {[1,2,3,4,5].map(star => (
                              <button key={star} className={`text-xl ${m.rating >= star ? 'text-yellow-500' : 'text-gray-400'} bg-transparent border-0 hover:scale-105 transition-transform`} onClick={() => handleEditMeal(m._id, 'rating', star)}>★</button>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <Button type="button" className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200" title="Delete meal" onClick={() => handleDeleteMeal(m._id)}><I.X/></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Sticky bottom bar for Save/Discard */}
            {showEditor && dirtyMeals && (
              <div className="sticky bottom-0 left-0 w-full bg-white border-t shadow flex justify-end gap-2 p-3 z-10">
                <Button className="bg-blue-600 text-white" onClick={handleSaveMeals}><I.Edit/> Save changes</Button>
                <Button className="bg-gray-200" onClick={handleDiscardMeals}><I.X/> Discard edits</Button>
              </div>
            )}
          </Card>

          {/* Cooks */}
          <Card className="bg-blue-100 border-2 border-blue-400 shadow-lg">
            <SectionTitle className="bg-blue-100 text-blue-900 font-extrabold p-2 rounded shadow">Cooks (Rotation & Names)</SectionTitle>
            <div className="text-sm text-blue-900 font-semibold mb-2">Edit names below. The rotation cycles through cooks across the week grid. You can add more cooks; IDs follow A, B, C…</div>
            <div className="space-y-2">
              {cooks.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="w-8 text-sm text-gray-500">{c.id}:</span>
                  <input value={c.name} onChange={(e) => setCooks((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} className="border rounded px-2 py-1 w-56 bg-white text-gray-900" />
                  <select
                    className="border rounded px-2 py-1 ml-2 text-sm bg-white text-gray-900"
                    value={c.selectedWeek ?? 0}
                    onChange={e => {
                      const weekIdx = Number(e.target.value);
                      setCooks(prev => prev.map((x, i) => i === idx ? { ...x, selectedWeek: weekIdx } : x));
                    }}
                  >
                    {Array.from({ length: weeks.length }).map((_, wIdx) => (
                      <option key={wIdx} value={wIdx}>Week {wIdx + 1}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-7 gap-1 ml-2">
                    {WEEKDAYS.map((wd, i) => {
                      const weekIdx = c.selectedWeek ?? 0;
                      const weekAvail = c.availabilityWeeks?.[weekIdx] || { mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true };
                      const isAvailable = weekAvail[wd] !== false;
                      return (
                        <button
                          key={wd}
                          title={`Cook is available on ${WEEKDAY_LABELS[i]}s`}
                          aria-label={`Toggle ${WEEKDAY_LABELS[i]} availability for ${c.name} in week ${weekIdx + 1}`}
                          className={`w-10 h-10 rounded ${isAvailable ? 'bg-green-200' : 'bg-gray-200'} border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500`}
                          tabIndex={0}
                          onClick={() => {
                            setCooks(prev => prev.map((x, j) => {
                              if (j !== idx) return x;
                              const weekAvail = x.availabilityWeeks?.[weekIdx] || { mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true };
                              return {
                                ...x,
                                availabilityWeeks: {
                                  ...x.availabilityWeeks,
                                  [weekIdx]: { ...weekAvail, [wd]: !isAvailable }
                                }
                              };
                            }));
                            setTimeout(() => fillWeeks({ dinnersOnly: DEFAULTS.dinnersOnly }), 0);
                          }}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') {
                            setCooks(prev => prev.map((x, j) => {
                              if (j !== idx) return x;
                              const weekAvail = x.availabilityWeeks?.[weekIdx] || { mon:true, tue:true, wed:true, thu:true, fri:true, sat:true, sun:true };
                              return {
                                ...x,
                                availabilityWeeks: {
                                  ...x.availabilityWeeks,
                                  [weekIdx]: { ...weekAvail, [wd]: !isAvailable }
                                }
                              };
                            }));
                            setTimeout(() => fillWeeks({ dinnersOnly: DEFAULTS.dinnersOnly }), 0);
                          }}}
                        >{WEEKDAY_LABELS[i][0]}</button>
                      );
                    })}
                  </div>
                  <Button disabled={cooks.length <= 1} onClick={() => removeCook(c.id)} title="Remove cook"><I.X/></Button>
                </div>
              ))}
              <Button onClick={addCook}><I.Plus/> <span className="ml-1">Add cook</span></Button>
            </div>
          </Card>

          {/* Grocery */}
          <Card className="bg-green-50 border-2 border-green-300 shadow-md">
            <SectionTitle className="text-green-900 font-bold bg-green-100 p-2 rounded">Grocery List (Week {activeWeek + 1})</SectionTitle>
            <div className="text-sm text-green-900 mb-2">Aggregated from all meals shown above. Use the Grocery scope selector to download for all cooks or a single cook.</div>
            <GroceryTable entries={currentWeekGrocery()} />
          </Card>

          {/* Controls - Upload data (relocated) */}
          <div className="mt-8">
            <div className="text-lg font-semibold mb-2">Manage data</div>
            <Card>
              <div className="mb-3 text-sm text-gray-600">
                The app accepts a simple table with <em>Meal Name</em> & <em>Average Score</em>, or your Sheet2 format with <em>Dish</em>, voter columns, and <em>Total Score</em>. Optionally include a <em>Recipe URL</em> column.
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Upload data</label>
                  <div className="flex gap-2">
                    <Button onClick={() => csvInputRef.current?.click()}><I.Upload/> Upload CSV</Button>
                    <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files && handleCSV(e.target.files[0])} />
                    <Button onClick={() => xlsInputRef.current?.click()}><I.Upload/> Upload Excel</Button>
                    <input ref={xlsInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files && handleExcel(e.target.files[0])} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min avg score</label>
                  <input type="number" step="0.1" value={threshold} onChange={(e) => setTextThreshold(Number(e.target.value) || 0)} className="w-full border rounded px-2 py-1 bg-white text-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                  <div className="inline-flex rounded-xl border overflow-hidden w-full">
                    <button className={`flex-1 px-3 py-1 text-sm ${mode === 'dinners' ? 'bg-blue-600 text-white' : 'bg-white'}`} onClick={() => setMode('dinners')}>Dinners</button>
                    <button className={`flex-1 px-3 py-1 text-sm ${mode === 'all' ? 'bg-blue-600 text-white' : 'bg-white'}`} onClick={() => setMode('all')}>All 21</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Repeat cap (per 4 wks)</label>
                  <input type="number" min={1} max={7} value={repeatCap} onChange={(e) => setRepeatCap(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} className="w-full border rounded px-2 py-1 bg-white text-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start date (Mon)</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded px-2 py-1 bg-white text-gray-900" />
                </div>
                <div className="lg:col-span-6 flex flex-wrap gap-2 justify-end mt-1">
                  <div className="mr-auto flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600">Grocery scope</label>
                    <select value={gScope} onChange={(e) => setGScope(e.target.value)} className="border rounded px-2 py-1 bg-white text-gray-900">
                      <option value="all">Week (all cooks)</option>
                      {cooks.map((c) => (<option key={c.id} value={c.id}>Week by {c.name}</option>))}
                    </select>
                  </div>
                  <Button onClick={() => downloadGroceryCSV(gScope === 'all' ? null : gScope)}><I.DL/> Grocery CSV</Button>
                  <Button onClick={downloadWeekCSV}><I.List/> Week CSV</Button>
                  <Button onClick={shuffleWeeks}><I.Shuffle/> Shuffle Plan</Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Export to Calendar */}
          <Card>
            <SectionTitle>Export to Calendar</SectionTitle>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-gray-700">Select weeks to export:</label>
              <select multiple className="border rounded px-2 py-1 text-sm bg-white text-gray-900" value={exportWeeks} onChange={e => setExportWeeks(Array.from(e.target.selectedOptions, o => Number(o.value)))}>
                {weeks.map((_, wIdx) => (
                  <option key={wIdx} value={wIdx}>Week {wIdx + 1}</option>
                ))}
              </select>
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={downloadICS}><I.Cal/> <span className="ml-1">Export Selected Weeks (.ics)</span></Button>
            </div>
          </Card>

          {/* Inline styles for readability and color accents */}
          <style>{`
            .meal-title{display:block;background:#fff;border:1px solid #bae6fd;border-radius:12px;padding:8px 12px;font-weight:600;color:#111827;line-height:1.3;box-shadow:inset 0 1px 0 rgba(16,185,129,.05)}
            .meal-title:hover{text-decoration:underline}
            .meal-ingredients{color:#374151;font-size:.95rem;line-height:1.35}
            .day-card{position:relative}
            .cookA.day-card{border-left:6px solid #60a5fa}
            .cookB.day-card{border-left:6px solid #c4b5fd}
            .cookDefault.day-card{border-left:6px solid #93c5fd}
            .cookA .day-body{background:#eff6ff}
            .cookB .day-body{background:#f5f3ff}
            .cookDefault .day-body{background:#f0f9ff}
            .cookA .meal-title{border-color:#bfdbfe}
            .cookB .meal-title{border-color:#ddd6fe}
            .cookDefault .meal-title{border-color:#bae6fd}
            @media print { header { display:none !important } body { background:white } }
          `}</style>
        </div>

        {/* Recipe Modal */}
        {recipeModal.open && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setRecipeModal({ open: false, meal: null })}>
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-[92%] p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold">{recipeModal.meal?.name}</h3>
                <button className="text-gray-500" onClick={() => setRecipeModal({ open: false, meal: null })}><I.X/></button>
              </div>
              <div className="text-sm text-gray-600 mb-3">Ingredients (editable in the table above):</div>
              <div className="text-sm bg-gray-50 border rounded p-3 mb-3 whitespace-pre-wrap">{recipeModal.meal?.ingredients || '—'}</div>
              {/* Editable recipe URL */}
              <form
                className="mb-3 flex gap-2 items-center"
                onSubmit={e => {
                  e.preventDefault();
                  const url = e.target.recipeUrl.value.trim();
                  // Update weeks (scheduled instance)
                  setWeeks(prev => {
                    const updated = prev.map((week, wIdx) =>
                      wIdx === activeWeek
                        ? week.map((day, dIdx) =>
                            dIdx === recipeModal.dayIndex && day.d
                              ? { ...day, d: { ...day.d, recipeUrl: url } }
                              : day
                          )
                        : week
                    );
                    setTimeout(triggerAutosave, 0);
                    return updated;
                  });
                  // Update meals table if meal with same name exists
                  if (recipeModal.meal?.name) {
                    setMeals(prev => {
                      const updated = prev.map(m =>
                        m.name === recipeModal.meal.name ? { ...m, recipeUrl: url } : m
                      );
                      setTimeout(triggerAutosave, 0);
                      return updated;
                    });
                  }
                  // Update modal
                  setRecipeModal(modal => ({ ...modal, meal: { ...modal.meal, recipeUrl: url } }));
                }}
              >
                <input
                  name="recipeUrl"
                  type="url"
                  defaultValue={recipeModal.meal?.recipeUrl || ''}
                  placeholder="https://..."
                  className="border rounded px-2 py-1 w-full"
                  style={{ minWidth: 0 }}
                />
                <Button type="submit" className="bg-blue-600 text-white px-3 py-1">Save</Button>
              </form>
              <div className="flex flex-wrap items-center gap-3">
                {!!recipeModal.meal?.recipeUrl && (<a className="underline" target="_blank" rel="noreferrer" href={recipeModal.meal?.recipeUrl}><I.Link/> Open saved recipe</a>)}
                <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent((recipeModal.meal?.name || '') + ' low sodium recipe')}`}>Search web recipes</a>
                <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent((recipeModal.meal?.name || '') + ' recipe site:eatingwell.com OR site:heart.org OR site:mayoclinic.org')}`}>Healthy sources</a>
              </div>
            </div>
          </div>
        )}

        {/* Add Meal Modal */}
        {addModal.open && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setAddModal({ open: false, meal: addModal.meal })}>
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-[92%] p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold">Add a Meal</h3>
                <button className="text-gray-500" onClick={() => setAddModal({ open: false, meal: addModal.meal })}><I.X/></button>
              </div>
              <form
                className="space-y-3"
                onSubmit={e => {
                  e.preventDefault();
                  const m = addModal.meal || {};
                  const name = String(m.name || '').trim();
                  const avg = Number(m.avg);
                  const type = m.type || inferMealType(name);
                  const ingredients = String(m.ingredients || '').trim() || ingredientHeuristics(name);
                  const recipeUrl = String(m.recipeUrl || '').trim();
                  if (!name) { alert('Please enter a meal name'); return; }
                  if (isNaN(avg)) { alert('Please enter a numeric average score'); return; }
                  setMeals(prev => ensureIds([...prev, { _id: `m${idCounterRef.current++}`, name, avg, type, ingredients, recipeUrl }]));
                  setAddModal({ open: false, meal: { name: '', avg: 7, type: 'Dinner', ingredients: '', recipeUrl: '' } });
                  setDirtyMeals(true);
                  setTimeout(triggerAutosave, 0);
                }}
              >
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Meal name</label>
                  <input
                    type="text"
                    value={addModal.meal.name}
                    onChange={e => setAddModal(m => ({ ...m, meal: { ...m.meal, name: e.target.value } }))}
                    placeholder="e.g., Whole-wheat pasta with turkey meatballs"
                    className="w-full border rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Average score</label>
                    <input
                      type="number" step="0.1" min="0" max="10"
                      value={addModal.meal.avg}
                      onChange={e => setAddModal(m => ({ ...m, meal: { ...m.meal, avg: e.target.value } }))}
                      className="w-full border rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={addModal.meal.type}
                      onChange={e => setAddModal(m => ({ ...m, meal: { ...m.meal, type: e.target.value } }))}
                      className="w-full border rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option>Breakfast</option>
                      <option>Lunch</option>
                      <option>Dinner</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ingredients</label>
                  <div className="flex gap-2 items-start">
                    <textarea
                      rows={4}
                      value={addModal.meal.ingredients}
                      onChange={e => setAddModal(m => ({ ...m, meal: { ...m.meal, ingredients: e.target.value } }))}
                      placeholder="Comma-separated: lean protein, vegetables, herbs, etc."
                      className="w-full border rounded-xl px-3 py-2 min-h-[96px] md:min-h-[120px] resize-none leading-snug focus:ring-2 focus:ring-blue-500"
                    />
                    <Button type="button" className="bg-white" onClick={() => setAddModal(m => ({ ...m, meal: { ...m.meal, ingredients: ingredientHeuristics(m.meal.name) } }))}><I.Edit/> Infer</Button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Tip: leave blank and tap Infer to auto-suggest from name.</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Recipe URL (optional)</label>
                  <input
                    type="url"
                    value={addModal.meal.recipeUrl}
                    onChange={e => setAddModal(m => ({ ...m, meal: { ...m.meal, recipeUrl: e.target.value } }))}
                    placeholder="https://..."
                    className="w-full border rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" className="bg-gray-100" onClick={() => setAddModal({ open: false, meal: addModal.meal })}><I.X/> Cancel</Button>
                  <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700"><I.Plus/> Save</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Inline styles for readability and color accents */}
        <style>{`
          .meal-title{display:block;background:#fff;border:1px solid #bae6fd;border-radius:12px;padding:8px 12px;font-weight:600;color:#111827;line-height:1.3;box-shadow:inset 0 1px 0 rgba(16,185,129,.05)}
          .meal-title:hover{text-decoration:underline}
          .meal-ingredients{color:#374151;font-size:.95rem;line-height:1.35}
          .day-card{position:relative}
          .cookA.day-card{border-left:6px solid #60a5fa}
          .cookB.day-card{border-left:6px solid #c4b5fd}
          .cookDefault.day-card{border-left:6px solid #93c5fd}
          .cookA .day-body{background:#eff6ff}
          .cookB .day-body{background:#f5f3ff}
          .cookDefault .day-body{background:#f0f9ff}
          .cookA .meal-title{border-color:#bfdbfe}
          .cookB .meal-title{border-color:#ddd6fe}
          .cookDefault .meal-title{border-color:#bae6fd}
          @media print { header { display:none !important } body { background:white } }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}

function GroceryTable({ entries }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of entries || []) { if (!map.has(e.category)) map.set(e.category, []); map.get(e.category).push(e); }
    for (const [, arr] of map) arr.sort((a, b) => a.name.localeCompare(b.name));
    return Array.from(map.entries());
  }, [entries]);

  const titleCase = (s) => String(s || '').trim().replace(/\s+/g, ' ').split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');

  return (
    <div className="overflow-auto border rounded">
      {(!grouped || !grouped.length) && (<div className="p-4 text-sm text-gray-500">No ingredients yet. Shuffle the plan or edit meals.</div>)}
      {grouped.map(([cat, items]) => (
        <div key={cat} className="p-4 border-t first:border-t-0">
          <div className="font-semibold mb-2 text-gray-900">{cat}</div>
          <ul className="divide-y">
            {items.map((it, i) => (
              <li key={i} className="flex items-center justify-between py-1.5">
                <span className="font-medium text-gray-900">{titleCase(it.name || '(unknown item)')}</span>
                <span className="text-gray-600">× {it.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Simple error boundary for React function components
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Optionally log error/info
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center text-red-700 bg-red-50 border border-red-300 rounded-xl">
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <pre className="text-sm whitespace-pre-wrap">{String(this.state.error)}</pre>
          <button className="mt-4 px-4 py-2 bg-gray-200 rounded" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
// Patch for function components
function withErrorBoundary(Component) {
  return function Wrapper(props) {
    const [error, setError] = useState(null);
    try {
      if (error) throw error;
      return <Component {...props} />;
    } catch (e) {
      setError(e);
      return <ErrorBoundary>{null}</ErrorBoundary>;
    }
  };
}

// Self-tests for constraints
function testMealPlanConstraints(weeks, maxRepeat) {
  const counts = {};
  let adjacencyViolations = 0;
  for (let w = 0; w < weeks.length; w++) {
    for (let d = 0; d < weeks[w].length; d++) {
      const meal = weeks[w][d].d?.name;
      if (!meal) continue;
      counts[meal] = (counts[meal] || 0) + 1;
      if (d > 0 && weeks[w][d - 1].d?.name === meal) adjacencyViolations++;
    }
  }
  const overRepeat = Object.values(counts).filter(c => c > maxRepeat);
  console.assert(overRepeat.length === 0, "No meal should repeat more than cap", overRepeat);
  console.assert(adjacencyViolations < 4, "Adjacency should be rare", adjacencyViolations);
}
