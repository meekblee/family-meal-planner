import { useEffect, useMemo, useRef, useState } from "react";

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
  <h2 className="text-xl font-semibold tracking-tight mb-2">{children}</h2>
);
const I = {
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
  const dt = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Family Meal Planner//EN"];
  events.forEach((ev, i) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:meal-${i}@familyplanner`);
    lines.push(`DTSTAMP:${dt(new Date())}`);
    lines.push(`DTSTART:${dt(ev.start)}`);
    lines.push(`DTEND:${dt(ev.end)}`);
    lines.push(`SUMMARY:${String(ev.title || "").replace(/,/g, " ")}`);
    if (ev.description) lines.push(`DESCRIPTION:${String(ev.description).replace(/\n/g, "\\n").replace(/,/g, " ")}`);
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
  cooks: [ { id: "A", name: "Stacey" }, { id: "B", name: "Sharon" } ],
};
const COOK_COLORS = {
  A: { chip: "bg-blue-100 text-blue-800 border-blue-200", text: "text-blue-700", border: "border-blue-300" },
  B: { chip: "bg-purple-100 text-purple-800 border-purple-200", text: "text-purple-700", border: "border-purple-300" },
  default: { chip: "bg-teal-100 text-teal-800 border-teal-200", text: "text-teal-700", border: "border-teal-300" },
};
const cookStyle = (id) => COOK_COLORS[id] || COOK_COLORS.default;
const cookClass = (id) => (id === "A" ? "cookA" : id === "B" ? "cookB" : "cookDefault");

// =============== App ===============
export default function MealPlannerApp() {
  const [meals, setMeals] = useState([]);
  const [threshold, setThreshold] = useState(3);
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

  const csvInputRef = useRef(null);
  const xlsInputRef = useRef(null);

  const cookName = (id) => cooks.find((c) => c.id === id)?.name || id;

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
    setMeals(sample);
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
          setMeals(parsed);
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
      setMeals(parsed);
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
    return Array.from({ length: 4 }, () => labels.map((l) => ({ label: l })));
  }
  function generateWithConstraints(pool, { dinnersOnly = DEFAULTS.dinnersOnly, seed = "", maxRepeatAcross4Weeks = DEFAULTS.maxRepeatAcross4Weeks, cookIds = ["A", "B"] }) {
    const rng = rngFactory(seed || "default");
    const weeksLocal = generateEmptyWeeks();
    const counts = Object.create(null);

    const pick = (weekIdx, dayIdx) => {
      const prevDay = dayIdx > 0 ? weeksLocal[weekIdx][dayIdx - 1] : null;
      const prevName = prevDay && prevDay.d && prevDay.d.name;
      let candidates = pool.filter((m) => (!dinnersOnly || (m.type || inferMealType(m.name)) === "Dinner") && (counts[m.name] || 0) < maxRepeatAcross4Weeks && m.name !== prevName);
      if (!candidates.length) candidates = pool.filter((m) => (!dinnersOnly || (m.type || inferMealType(m.name)) === "Dinner") && (counts[m.name] || 0) < maxRepeatAcross4Weeks);
      if (!candidates.length) candidates = pool.filter((m) => !dinnersOnly || (m.type || inferMealType(m.name)) === "Dinner");
      return candidates[Math.floor(rng() * candidates.length)];
    };

    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 7; d++) {
        const day = weeksLocal[w][d];
        const dinner = pick(w, d);
        day.d = dinner;
        counts[dinner.name] = (counts[dinner.name] || 0) + 1;
        if (!dinnersOnly) {
          day.b = pool.find((m) => (m.type || inferMealType(m.name)) === "Breakfast") || dinner;
          day.l = pool.find((m) => (m.type || inferMealType(m.name)) === "Lunch") || dinner;
        }
        const ids = cookIds && cookIds.length ? cookIds : ["A"];
        day.cook = ids[(d + w) % ids.length];
      }
    }
    return weeksLocal;
  }
  function fillWeeks({ dinnersOnly = DEFAULTS.dinnersOnly }) {
    const pool = [...filteredMeals];
    if (!pool.length) return alert("No meals available above threshold.");
    const ids = cooks.map((c) => c.id);
    const filled = generateWithConstraints(pool, { dinnersOnly, seed, maxRepeatAcross4Weeks: repeatCap, cookIds: ids.length ? ids : ["A"] });
    setWeeks(filled);
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
    const base = new Date(startDate + 'T00:00:00');
    const events = [];
    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 7; d++) {
        const day = weeks[w][d]; const dinner = day.d; if (!dinner) continue;
        const start = new Date(base); start.setDate(start.getDate() + (w * 7 + d)); start.setHours(DEFAULTS.dinnerHour, DEFAULTS.dinnerMinutes, 0, 0);
        const end = new Date(start); end.setMinutes(end.getMinutes() + 90);
        const description = buildEventDescription(dinner);
        events.push({ title: `${dinner.name} (Cook ${cookName(day.cook || 'A')})`, start, end, description });
      }
    }
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

  // Cook list mgmt
  function addCook() { const nextId = String.fromCharCode(65 + cooks.length); setCooks((prev) => [...prev, { id: nextId, name: `Cook ${nextId}` }]); }
  function removeCook(id) { if (cooks.length <= 1) return; setCooks((prev) => prev.filter((c) => c.id !== id)); }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">Family Meal Planner</h1>
            <p className="text-sm md:text-base text-gray-600">4-week rotation • dinners at 6:00 PM • Stacey &amp; Sharon</p>
          </div>
          <div className="flex gap-2">
            <Button className="bg-gray-900 text-white hover:opacity-90" onClick={printPDF}><I.Print/> <span className="ml-1">Print / Save PDF</span></Button>
            <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={downloadICS}><I.Cal/> <span className="ml-1">Export Dinners (.ics)</span></Button>
          </div>
        </header>

        {/* Controls */}
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
              <input type="number" step="0.1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)} className="w-full border rounded px-2 py-1 bg-white text-gray-900" />
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

        {/* Meals editor */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-gray-900">Meals Editor</div>
            <Button onClick={() => setShowEditor((v) => !v)}><I.Edit/> <span className="ml-1">{showEditor ? 'Hide' : 'Edit'} meals</span></Button>
          </div>
          {!showEditor && <div className="text-xs text-gray-600 mb-1">Click <span className="font-medium">Edit meals</span> to view & edit the list ({filteredMeals.length} above threshold).</div>}
          {showEditor && (
            <div className="overflow-auto max-h-[320px] border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-200 text-gray-800 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Meal Name</th>
                    <th className="text-left p-2">Avg</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Ingredients</th>
                    <th className="text-left p-2">Recipe URL</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeals.map((m, idx) => (
                    <tr key={idx} className="border-t odd:bg-white even:bg-gray-50">
                      <td className="p-2 text-gray-900 font-medium">{m.name}</td>
                      <td className="p-2">{Number(m.avg).toFixed(1)}</td>
                      <td className="p-2">
                        <select value={m.type || 'Dinner'} onChange={(e) => { const t = e.target.value; setMeals((prev) => prev.map((x, i) => (i === idx ? { ...x, type: t } : x))); }} className="border rounded px-2 py-1">
                          <option>Breakfast</option><option>Lunch</option><option>Dinner</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input value={m.ingredients || ''} onChange={(e) => { const val = e.target.value; setMeals((prev) => prev.map((x, i) => (i === idx ? { ...x, ingredients: val } : x))); }} className="w-full border rounded px-2 py-1" />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <I.Link/>
                          <input value={m.recipeUrl || ''} placeholder="https://..." onChange={(e) => { const val = e.target.value; setMeals((prev) => prev.map((x, i) => (i === idx ? { ...x, recipeUrl: val } : x))); }} className="w-full border rounded px-2 py-1" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Planner */}
        <Card>
          <SectionTitle>3) 4-Week Plan</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Button key={i} className={`${activeWeek === i ? 'bg-blue-600 text-white' : 'bg-white'}`} onClick={() => setActiveWeek(i)}>Week {i + 1}</Button>
            ))}
            <div className="ml-auto flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm">Grocery scope:</span>
                <select value={gScope} onChange={(e) => setGScope(e.target.value)} className="border rounded px-2 py-1">
                  <option value="all">Week (all cooks)</option>
                  {cooks.map((c) => (<option key={c.id} value={c.id}>Week by {c.name}</option>))}
                </select>
              </div>
              <Button onClick={() => downloadGroceryCSV(gScope === 'all' ? null : gScope)}><I.DL/> <span className="ml-1">Download Grocery CSV</span></Button>
              <Button onClick={downloadWeekCSV}><I.List/> <span className="ml-1">Download Week CSV</span></Button>
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
                    <div className="text-xs text-gray-600">Dinner</div>
                    <button className="meal-title w-full text-left" onClick={() => setRecipeModal({ open: true, meal: day.d || null })}>{(day.d && day.d.name) || '—'}</button>
                    <div className="meal-ingredients mt-2">{(day.d && day.d.ingredients) || ''}</div>
                    {!!(day.d && day.d.recipeUrl) && (
                      <div className="text-xs mt-1"><a className="underline" target="_blank" rel="noreferrer" href={day.d.recipeUrl}>Open saved recipe</a></div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Cooks */}
        <Card>
          <SectionTitle>4) Cooks (Rotation & Names)</SectionTitle>
          <div className="text-sm text-gray-600 mb-2">Edit names below. The rotation cycles through cooks across the week grid. You can add more cooks; IDs follow A, B, C…</div>
          <div className="space-y-2">
            {cooks.map((c, idx) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-8 text-sm text-gray-500">{c.id}:</span>
                <input value={c.name} onChange={(e) => setCooks((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} className="border rounded px-2 py-1 w-56 bg-white text-gray-900" />
                <Button disabled={cooks.length <= 1} onClick={() => removeCook(c.id)} title="Remove cook"><I.X/></Button>
              </div>
            ))}
            <Button onClick={addCook}><I.Plus/> <span className="ml-1">Add cook</span></Button>
          </div>
        </Card>

        {/* Grocery */}
        <Card>
          <SectionTitle>5) Grocery List (Week {activeWeek + 1})</SectionTitle>
          <div className="text-sm text-gray-600 mb-2">Aggregated from all meals shown above. Use the Grocery scope selector to download for all cooks or a single cook.</div>
          <GroceryTable entries={currentWeekGrocery()} />
        </Card>

        <footer className="text-xs text-gray-500 text-center pb-8">Tip: Save a copy as PDF using the Print button. Use the seed to reproduce a favorite shuffle later.</footer>
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
            <div className="flex flex-wrap items-center gap-3">
              {!!recipeModal.meal?.recipeUrl && (<a className="underline" target="_blank" rel="noreferrer" href={recipeModal.meal?.recipeUrl}><I.Link/> Open saved recipe</a>)}
              <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent((recipeModal.meal?.name || '') + ' low sodium recipe')}`}>Search web recipes</a>
              <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${encodeURIComponent((recipeModal.meal?.name || '') + ' recipe site:eatingwell.com OR site:heart.org OR site:mayoclinic.org')}`}>Healthy sources</a>
            </div>
          </div>
        </div>
      )}

      {/* Inline styles for readability and color accents */}
      <style>{`
        .meal-title{display:block;background:#fff;border:1px solid #cfe9d5;border-radius:12px;padding:8px 12px;font-weight:600;color:#111827;line-height:1.3;box-shadow:inset 0 1px 0 rgba(16,185,129,.05)}
        .meal-title:hover{text-decoration:underline}
        .meal-ingredients{color:#374151;font-size:.95rem;line-height:1.35}
        .day-card{position:relative}
        .cookA.day-card{border-left:6px solid #2563eb}
        .cookB.day-card{border-left:6px solid #7c3aed}
        .cookDefault.day-card{border-left:6px solid #14b8a6}
        .cookA .day-body{background:#eff6ff}
        .cookB .day-body{background:#f5f3ff}
        .cookDefault .day-body{background:#ecfdf5}
        .cookA .meal-title{border-color:#bfdbfe}
        .cookB .meal-title{border-color:#ddd6fe}
        .cookDefault .meal-title{border-color:#cfe9d5}
        @media print { header { display:none !important } body { background:white } }
      `}</style>
    </div>
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
