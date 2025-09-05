(() => {
  const { useState, useEffect, useMemo, useRef } = React;

  // --- Utils ---
  const uid = () => Math.random().toString(36).slice(2, 10);
  const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
  const fmtHMS = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(total % 60)).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };
  const clampToSameDay = (start, end) => {
    const s = new Date(start);
    const e = new Date(end ?? Date.now());
    const out = [];
    let curStart = s;
    while (curStart < e) {
      const nextMidnight = new Date(curStart);
      nextMidnight.setHours(24,0,0,0);
      const curEnd = e < nextMidnight ? e : nextMidnight;
      out.push([curStart.getTime(), curEnd.getTime()]);
      curStart = nextMidnight;
    }
    return out;
  };

  // --- Main categories (trackable) ---
  const CATS = [
    ["p-work", "🧑‍💻 Work & Productivity", "Deep work, meetings/calls, email/admin, learning, side projects, commuting for work"],
    ["p-health", "🏃 Health & Fitness", "Exercise, walking, stretching, sports, sleep, healthy cooking"],
    ["p-mind", "🧠 Mental Wellbeing", "Meditation, journaling, therapy, downtime, nature walks"],
    ["p-growth", "📚 Personal Growth", "Reading, courses/classes, language learning, creative hobbies, podcasts"],
    ["p-home", "💸 Finance & Household", "Budgeting, chores/cleaning, laundry/cooking, groceries, errands/bills"],
    ["p-social", "👨‍👩‍👧 Social & Relationships", "Family/partner time, kids activities, friends, volunteering"],
    ["p-digital", "📱 Digital & Entertainment", "Screen time, TV/movies, gaming, news, browsing"],
    ["p-other", "🐾 Other / Custom", "Pet care, gardening, personal travel, hobbies, idle time"],
  ];

  const CAT_COLORS = {
    "p-work":   { bg:"#dbeafe", border:"#bfdbfe" },
    "p-health": { bg:"#dcfce7", border:"#bbf7d0" },
    "p-mind":   { bg:"#fde68a", border:"#fcd34d" },
    "p-growth": { bg:"#f5d0fe", border:"#f0abfc" },
    "p-home":   { bg:"#fee2e2", border:"#fecaca" },
    "p-social": { bg:"#e0e7ff", border:"#c7d2fe" },
    "p-digital":{ bg:"#f3e8ff", border:"#e9d5ff" },
    "p-other":  { bg:"#e5e7eb", border:"#d1d5db" },
  };

  // --- Storage ---
  const STORAGE_KEY = "time-tracker-projects-picker-v2";
  function useLocalState(defaultState) {
    const [state, setState] = useState(() => {
      try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : defaultState; }
      catch { return defaultState; }
    });
    useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
    return [state, setState];
  }

  function App() {
    const [db, setDb] = useLocalState({
      categories: CATS.map(([id, name, examples]) => ({ id, name, examples, goalMinutes: 0 })),
      projects: [], // seeded in useEffect
      intervals: [], // {id, catId, projId, start, end}
      lastProjectByCat: {},
    });
    const [tab, setTab] = useState("today");

    // Seed default projects on first run
    useEffect(() => {
      if (db.projects.length === 0) {
        const defaults = [
          {catId:"p-work", name:"General Work"},
          {catId:"p-health", name:"General Fitness"},
          {catId:"p-mind", name:"General Wellbeing"},
          {catId:"p-growth", name:"General Growth"},
          {catId:"p-home", name:"General Household"},
          {catId:"p-social", name:"General Social"},
          {catId:"p-digital", name:"General Digital"},
          {catId:"p-other", name:"General Other"},
        ].map(x => ({ id: uid(), ...x }));
        setDb(cur => ({ ...cur, projects: defaults }));
      }
    }, []); // run once

    // 1-second ticker
    const [tick, setTick] = useState(Date.now());
    useEffect(() => {
      const id = setInterval(() => setTick(Date.now()), 1000);
      return () => clearInterval(id);
    }, []);

    const running = useMemo(() => db.intervals.find(i => i.end == null), [db.intervals, tick]);
    // Note-on-stop modal state
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [noteText, setNoteText] = useState("");
    const [pendingStopId, setPendingStopId] = useState(null);

    function requestStop() {
      if (!running) return;
      setPendingStopId(running.id);
      setNoteText("");
      setShowNoteModal(true);
    }
    function cancelNote() {
      setShowNoteModal(false);
      setNoteText("");
      setPendingStopId(null);
    }
    function saveNoteAndStop() {
      if (!pendingStopId) return;
      const note = noteText.trim();
      setDb(cur => ({
        ...cur,
        intervals: cur.intervals.map(iv => iv.id===pendingStopId && iv.end==null
          ? { ...iv, end: Date.now(), note: note || undefined }
          : iv
        )
      }));
      setShowNoteModal(false);
      setNoteText("");
      setPendingStopId(null);
    }
    function stopWithoutNote() {
      if (!pendingStopId) return;
      setDb(cur => ({
        ...cur,
        intervals: cur.intervals.map(iv => iv.id===pendingStopId && iv.end==null
          ? { ...iv, end: Date.now() }
          : iv
        )
      }));
      setShowNoteModal(false);
      setNoteText("");
      setPendingStopId(null);
    }


    const catById = id => db.categories.find(c=>c.id===id);
    const projById = id => db.projects.find(p=>p.id===id);

    function startTimer(catId, projId) {
      setDb(cur => {
        const intervals = cur.intervals.map(i => i.end == null ? { ...i, end: Date.now() } : i);
        intervals.push({ id: uid(), catId, projId, start: Date.now(), end: null });
        return { ...cur, intervals, lastProjectByCat: { ...(cur.lastProjectByCat||{}), [catId]: projId } };
      });
    }
    function stopTimer() {
      setDb(cur => ({ ...cur, intervals: cur.intervals.map(i => i.end == null ? { ...i, end: Date.now() } : i) }));
    }
    function addProject(catId, name) {
      if (!name || !name.trim()) return;
      const nm = name.trim();
      setDb(cur => ({ ...cur, projects: [...cur.projects, { id: uid(), catId, name: nm }], lastProjectByCat: { ...(cur.lastProjectByCat||{}), [catId]: (cur.lastProjectByCat?.[catId] || null) } }));
    }

    // Export CSV
    const exportCSV = () => {
      const lines = [["interval_id","category","project","start_iso","end_iso","duration_ms","note"].join(",")];
      for (const iv of db.intervals) {
        const end = iv.end ?? Date.now();
        const cat = catById(iv.catId)?.name || "";
        const proj = projById(iv.projId)?.name || "";
        const cells = [iv.id, cat, proj, new Date(iv.start).toISOString(), new Date(end).toISOString(), String(end - iv.start), (iv.note||"")]
          .map(x => `"${String(x).replaceAll('"','""')}"`);
        lines.push(cells.join(","));
      }
      const blob = new Blob([lines.join("\n")], {type:"text/csv"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `time-tracker-${todayKey()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    // Totals (finished only)
    const totals = useMemo(() => {
      const perCatToday = new Map(), perCatAll = new Map();
      const perProjToday = new Map(), perProjAll = new Map();
      const push = (map, key, ms) => map.set(key, (map.get(key)||0)+ms);
      for (const iv of db.intervals) {
        if (iv.end == null) continue;
        for (const [s,e] of clampToSameDay(iv.start, iv.end)) {
          const ms = e - s; const day = todayKey(new Date(s));
          push(perCatAll, iv.catId, ms); push(perProjAll, iv.projId, ms);
          if (day === todayKey()) { push(perCatToday, iv.catId, ms); push(perProjToday, iv.projId, ms); }
        }
      }
      return { perCatToday, perCatAll, perProjToday, perProjAll };
    }, [db]);

    // Live today per category
    const liveTodayPerCat = useMemo(() => {
      const map = new Map(db.categories.map(c => [c.id, totals.perCatToday.get(c.id)||0]));
      if (running) {
        for (const [s,e] of clampToSameDay(running.start, Date.now())) {
          const dk = todayKey(new Date(s));
          if (dk === todayKey()) map.set(running.catId, (map.get(running.catId)||0) + (e - s));
        }
      }
      return map;
    }, [totals, running, tick, db.categories]);

    // Weekly goals & streaks (by category)
    function buildDayCatMinutes(days=7) {
      const map = new Map();
      const today = new Date(); today.setHours(0,0,0,0);
      const start = new Date(today); start.setDate(start.getDate() - (days-1));
      const startMs = start.getTime(); const endMs = new Date(today); endMs.setHours(24,0,0,0);
      function push(dayKey, catId, ms) { const key = `${dayKey}|${catId}`; map.set(key, (map.get(key)||0)+ms); }
      for (const iv of db.intervals) {
        const e = iv.end ?? Date.now();
        for (const [s,e2] of clampToSameDay(iv.start, e)) {
          if (e2 < startMs || s > endMs) continue;
          push(new Date(s).toISOString().slice(0,10), iv.catId, e2 - s);
        }
      }
      if (running) {
        for (const [s,e] of clampToSameDay(running.start, Date.now())) {
          const dk = new Date(s).toISOString().slice(0,10);
          if (dk === todayKey()) push(dk, running.catId, e - s);
        }
      }
      return map;
    }
    function computeWeeklyTotals() {
      const days = 7;
      const dayMap = buildDayCatMinutes(days);
      const labels = []; const today = new Date(); today.setHours(0,0,0,0);
      for (let i=days-1;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); labels.push(d.toISOString().slice(0,10)); }
      const perDayPerCat = {}; for (const c of db.categories) perDayPerCat[c.id] = Array(days).fill(0);
      for (let di=0; di<labels.length; di++) {
        const dk = labels[di];
        for (const c of db.categories) {
          const ms = dayMap.get(`${dk}|${c.id}`) || 0;
          perDayPerCat[c.id][di] = Math.round(ms/60000);
        }
      }
      const weeklyPerCat = {}; for (const c of db.categories) weeklyPerCat[c.id] = perDayPerCat[c.id].reduce((a,b)=>a+b,0);
      return { labels, perDayPerCat, weeklyPerCat };
    }
    function computeStreaks() {
      const today = new Date(); today.setHours(0,0,0,0);
      const days = 120; const dayMap = buildDayCatMinutes(days);
      const streakNow = {}; const bestStreak = {};
      const keys = []; for (let i=days-1;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); keys.push(d.toISOString().slice(0,10)); }
      for (const c of db.categories) { let cur=0,best=0;
        for (const dk of keys) {
          const ms = dayMap.get(`${dk}|${c.id}`) || 0;
          const goal = c.goalMinutes||0;
          const hit = goal>0 ? (ms >= goal*60000) : false;
          if (hit) { cur++; best=Math.max(best,cur); } else { cur=0; }
        }
        streakNow[c.id]=cur; bestStreak[c.id]=best;
      }
      return { streakNow, bestStreak };
    }

    // UI
    const Header = () => (
      React.createElement("div", { className: "header" },
        React.createElement("div", { className: "h1" }, React.createElement("span", {className:"emoji"}, "⏱"), " Time Tracker"),
        React.createElement("div", { className: "actions" },
          React.createElement("button", { className: "tab", onClick: exportCSV }, "Export CSV")
        )
      )
    );

    const Tabs = () => (
      React.createElement("div", { className: "tabs" },
        ["today","items","projects","history","calendar"].map(t =>
          React.createElement("button", { key:t, className: `tab ${tab===t?"active":""}`, onClick: ()=>setTab(t)}, t[0].toUpperCase()+t.slice(1))
        )
      )
    );

    const RunningNow = () => (
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "content" },
          running ? (
            React.createElement(React.Fragment, null,
              React.createElement("div", { className: "row" },
                React.createElement("div", null,
                  React.createElement("div", { style:{fontWeight:700, fontSize:18}}, catById(running.catId)?.name || ""),
                  React.createElement("div", { className: "small" }, "Project: ", projById(running.projId)?.name || "")
                ),
                React.createElement("div", { className: "right" },
                  React.createElement("button", { className: "danger", onClick: ()=>requestStop() }, "■ Stop")
                )
              ),
              React.createElement("div", { className: "separator" }),
              React.createElement("div", { className: "meta" }, "Elapsed: ", (function(ms){ return fmtHMS(1000 * Math.floor(ms/1000)); })(Date.now() - running.start)),
              React.createElement("div", { className: "small" }, "Tip: Stop to save this time into today's totals.")
            )
          ) : (
            React.createElement("div", { className: "meta" }, "Nothing running. Pick a category + project below to start.")
          )
        )
      )
    );

    function CategoryCard({ cat }) {
      const projects = db.projects.filter(p => p.catId === cat.id);
      const last = db.lastProjectByCat?.[cat.id] || (projects[0]?.id || "");
      const [sel, setSel] = useState(last);
      const [newProj, setNewProj] = useState("");

      function start() {
        const projId = sel || (projects[0]?.id);
        if (!projId) return;
        startTimer(cat.id, projId);
      }
      function createProject() {
        if (!newProj.trim()) return;
        const name = newProj.trim();
        const newId = uid();
        setDb(cur => ({ ...cur, projects: [...cur.projects, { id:newId, catId: cat.id, name }], lastProjectByCat: { ...(cur.lastProjectByCat||{}), [cat.id]: newId } }));
        setSel(newId);
        setNewProj("");
      }

      const todayMs = totals.perCatToday.get(cat.id) || 0;
      const isRunning = running?.catId === cat.id;

      return React.createElement("div", { className: "card" },
        React.createElement("div", { className: "content" },
          React.createElement("div", { className: "row" },
            React.createElement("strong", null, cat.name),
            React.createElement("span", { className: "badge" }, "Category")
          ),
          React.createElement("div", { className: "small" }, "Examples: ", cat.examples),
          React.createElement("div", { className: "separator" }),
          React.createElement("div", { className: "row" },
            React.createElement("select", { value: sel, onChange:e=>setSel(e.target.value), style:{minWidth:200} },
              projects.length === 0 ? React.createElement("option", { value:"" }, "No projects yet") :
              projects.map(p => React.createElement("option", { key:p.id, value:p.id }, p.name))
            ),
            isRunning && running.catId===cat.id
              ? React.createElement("button", { className: "danger", onClick: ()=>requestStop() }, "■ Stop")
              : React.createElement("button", { className: "primary", onClick: start }, "▶ Start"),
            React.createElement("div", { className: "right meta" }, "Today: ", fmtHMS(todayMs))
          ),
          React.createElement("div", { className:"row", style:{marginTop:8} },
            React.createElement("input", { placeholder: "New project name…", value:newProj, onChange:e=>setNewProj(e.target.value) }),
            React.createElement("button", { onClick: createProject }, "+ Add Project")
          )
        )
      ));
    }

    const ItemsTab = () => (
      React.createElement("div", { className: "grid two" },
        db.categories.map(cat => React.createElement(CategoryCard, { key: cat.id, cat }))
      )
    );

    const ProjectsTab = () => {
      const cards = db.projects.map(p => {
        const today = totals.perProjToday.get(p.id)||0;
        const all = totals.perProjAll.get(p.id)||0;
        const isRunning = running?.projId === p.id;
        return React.createElement("div", { key:p.id, className:"card" },
          React.createElement("div", { className:"content" },
            React.createElement("div", { className:"row" },
              React.createElement("div", null,
                React.createElement("div", { style:{fontWeight:600}}, p.name),
                React.createElement("div", { className:"small" }, db.categories.find(c=>c.id===p.catId)?.name || "")
              ),
              isRunning
                ? React.createElement("button", { className:"danger right", onClick: ()=>requestStop() }, "■ Stop")
                : React.createElement("button", { className:"primary right", onClick: ()=>startTimer(p.catId, p.id) }, "▶ Start")
            ),
            React.createElement("div", { className:"separator" }),
            React.createElement("div", { className:"meta" }, "Today: ", fmtHMS(today)),
            React.createElement("div", { className:"meta" }, "All-time: ", fmtHMS(all))
          )
        ));
      });
      return React.createElement("div", null, cards);
    };

    // History
    const [range, setRange] = useState(() => {
      const end = new Date();
      const start = new Date(); start.setDate(end.getDate()-6);
      const toKey = d => d.toISOString().slice(0,10);
      return { start: toKey(start), end: toKey(end) };
    });
    
    const historyRows = useMemo(() => {
      const map = new Map(); // key -> { ms, notes: Set }
      const push = (day,cat,proj,ms,note) => {
        const key = `${day}|${cat}|${proj}`;
        const cur = map.get(key) || { ms:0, notes: new Set() };
        cur.ms += ms;
        if (note) cur.notes.add(note);
        map.set(key, cur);
      };
      const startTime = new Date(range.start+"T00:00:00").getTime();
      const endTime = new Date(range.end+"T23:59:59").getTime();
      for (const iv of db.intervals) {
        if (iv.end == null) continue;
        for (const [s,e] of clampToSameDay(iv.start, iv.end)) {
          if (e < startTime || s > endTime) continue;
          const day = new Date(s).toISOString().slice(0,10);
          const cat = catById(iv.catId)?.name || "";
          const proj = projById(iv.projId)?.name || "";
          push(day, cat, proj, e - s, iv.note);
        }
      }
      const out = [];
      for (const key of Array.from(map.keys()).sort()) {
        const [day, cat, proj] = key.split("|");
        const entry = map.get(key);
        out.push({ day, cat, proj, ms: entry.ms, note: Array.from(entry.notes).join(" • ") });
      }
      return out;
    }, [db, range]);

    const HistoryTab = () => (
      React.createElement("div", { className: "card" },
        React.createElement("div", { className: "content" },
          React.createElement("div", { className: "row" },
            React.createElement("label", { className:"meta", style:{width:60}}, "From"),
            React.createElement("input", { type:"date", value: range.start, max: range.end, onChange:e=>setRange(r=>({...r, start:e.target.value})) }),
            React.createElement("div", { style:{width:12} }),
            React.createElement("label", { className:"meta", style:{width:40}}, "To"),
            React.createElement("input", { type:"date", value: range.end, min: range.start, onChange:e=>setRange(r=>({...r, end:e.target.value})) }),
          ),
          React.createElement("div", { className: "separator"}),
          historyRows.length === 0 ? (
            React.createElement("div", { className: "meta" }, "No finished time in selected range.")
          ) : (
            React.createElement("table", { className: "table" },
              React.createElement("thead", null,
                React.createElement("tr", null,
                  React.createElement("th", null, "Date"),
                  React.createElement("th", null, "Category"),
                  React.createElement("th", null, "Project"),
                  React.createElement("th", null, "Time"),
                  React.createElement("th", null, "Note")
                )
              ),
              React.createElement("tbody", null,
                historyRows.map((r,i) => React.createElement("tr", { key:i },
                  React.createElement("td", null, r.day),
                  React.createElement("td", null, r.cat),
                  React.createElement("td", null, r.proj),
                  React.createElement("td", null, fmtHMS(r.ms)),
                  React.createElement("td", null, r.note || "")
                ))
              )
            )
          )
        )
      )
    );

    // Calendar
    function splitIntervalByDay(startMs, endMs, dayDate) {
      const start = new Date(startMs);
      const end = new Date(endMs ?? Date.now());
      const dayStart = new Date(dayDate); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(dayDate); dayEnd.setHours(24,0,0,0);
      const s = Math.max(start.getTime(), dayStart.getTime());
      const e = Math.min(end.getTime(), dayEnd.getTime());
      if (e <= s) return []; return [[s, e]];
    }
    const [calDay, setCalDay] = useState(() => (new Date()).toISOString().slice(0,10));
    function dayShift(delta) { const d = new Date(calDay); d.setDate(d.getDate()+delta); setCalDay(d.toISOString().slice(0,10)); }
    
    const daySegments = useMemo(() => {
      const segments = [];
      const dayDate = new Date(calDay+"T00:00:00");
      for (const iv of db.intervals) {
        const endMs = iv.end ?? Date.now();
        for (const [s,e] of splitIntervalByDay(iv.start, endMs, dayDate)) {
          const cat = catById(iv.catId)?.name || "";
          const proj = projById(iv.projId)?.name || "";
          segments.push({ catId: iv.catId, label: proj ? `${cat} — ${proj}` : cat, start: s, end: e, note: iv.note });
        }
      }
      segments.sort((a,b)=>a.start-b.start);
      return segments;
    }, [db, calDay, tick]);

    const CalendarTab = () => {
      const labels = Array.from({length:25}, (_,i)=> (i<10?"0":"")+i+":00");
      const blocks = daySegments.map((seg, idx) => {
        const dayStart = new Date(calDay+"T00:00:00").getTime();
        const top = ((seg.start - dayStart) / (24*3600*1000)) * 600;
        const height = Math.max(6, ((seg.end - seg.start) / (24*3600*1000)) * 600);
        const c = CAT_COLORS[seg.catId] || { bg:"#dbeafe", border:"#bfdbfe" };
        return React.createElement("div", { key: idx, className:"block", title: (seg.note? seg.note : seg.label), style:{ top: top+"px", height: height+"px", background:c.bg, borderColor:c.border } }, seg.label);
      });
      const legend = db.categories.map(c => {
        const cc = CAT_COLORS[c.id] || { bg:"#dbeafe", border:"#bfdbfe" };
        return React.createElement("div", { key:c.id, className:"chip" },
          React.createElement("div", { className:"swatch", style:{ background:cc.bg, borderColor:cc.border } }),
          c.name
        );
      });
      return React.createElement("div", null,
        React.createElement("div", { className:"card" },
          React.createElement("div", { className:"content" },
            React.createElement("div", { className:"calendar-controls" },
              React.createElement("button", { className:"tab", onClick: ()=>dayShift(-1) }, "◀ Prev"),
              React.createElement("input", { type:"date", value: calDay, onChange:e=>setCalDay(e.target.value) }),
              React.createElement("button", { className:"tab", onClick: ()=>dayShift(1) }, "Next ▶")
            ),
            React.createElement("div", { className:"legend" }, legend)
          )
        ),
        React.createElement("div", { className:"timeline" },
          React.createElement("div", { className:"hour-lines" }),
          React.createElement("div", { className:"labels" },
            labels.slice(0,24).map((t,i)=> React.createElement("div",{key:i}, t))
          ),
          React.createElement("div", { className:"tracks" }, blocks)
        )
      );
    };

    // Today chart (live by category)
    const TodayChart = () => {
      const canvasRef = useRef(null);
      const chartRef = useRef(null);
      const labels = db.categories.map(c => c.name);
      const data = db.categories.map(c => Math.round((liveTodayPerCat.get(c.id)||0)/60000));
      useEffect(() => {
        const ctx = canvasRef.current.getContext("2d");
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        chartRef.current = new Chart(ctx, {
          type: "bar",
          data: { labels, datasets: [{ label: "Minutes today (live)", data }] },
          options: { responsive: true, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }
        });
        return () => { if (chartRef.current) chartRef.current.destroy(); };
      }, [labels.join('|'), data.join('|')]);
      return React.createElement("div", { className: "card" },
        React.createElement("div", { className: "content" },
          React.createElement("div", { className: "row" }, React.createElement("strong", null, "Today: Time by Category (live)")),
          React.createElement("div", { className: "chart-wrap" }, React.createElement("canvas", { ref: canvasRef, width: 600, height: 320 }))
        )
      );
    };

    const WeeklySummaryCard = () => {
      const { weeklyPerCat } = computeWeeklyTotals();
      const { streakNow, bestStreak } = computeStreaks();
      const totalWeekMins = Object.values(weeklyPerCat).reduce((a,b)=>a+b,0);
      const weeklyGoalTotal = db.categories.reduce((sum,c)=> sum + (c.goalMinutes||0)*7, 0);
      const pct = weeklyGoalTotal > 0 ? Math.min(100, Math.round((totalWeekMins / weeklyGoalTotal)*100)) : 0;

      return React.createElement("div", { className:"card summary-card" },
        React.createElement("div", { className:"content" },
          React.createElement("div", { className:"grid" },
            React.createElement("div", null,
              React.createElement("div", { className:"ring", style:{ "--p": `${pct}%` } },
                `${pct}%`,
                React.createElement("small", null, "of weekly goal")
              ),
              React.createElement("div", { className:"meta", style:{marginTop:8} }, `This week: ${Math.floor(totalWeekMins/60)}h ${totalWeekMins%60}m`)
            ),
            React.createElement("div", null,
              React.createElement("div", { className:"meta" }, "Streaks (goal-based)"),
              React.createElement("div", { className:"streaks" },
                db.categories.map(c => {
                  const now = streakNow[c.id] || 0;
                  const best = bestStreak[c.id] || 0;
                  const g = c.goalMinutes || 0;
                  const label = g>0 ? `${c.name}: ${now} day streak (best ${best})` : `${c.name}: set a daily goal to track streaks`;
                  return React.createElement("div", { key:c.id }, label);
                })
              )
            ),
            React.createElement("div", null,
              React.createElement("div", { className:"meta" }, "Set daily goals (minutes)"),
              db.categories.map(c =>
                React.createElement("div", { key:c.id, className:"goal-row" },
                  React.createElement("label", { className:"small", style:{width:"60%"} }, c.name),
                  React.createElement("input", { type:"number", min:"0", value:c.goalMinutes||0, onChange:e=>{
                    const v = Number(e.target.value)||0;
                    setDb(cur => ({ ...cur, categories: cur.categories.map(cc => cc.id===c.id ? { ...cc, goalMinutes: v } : cc) }));
                  } })
                )
              )
            )
          )
        )
      );
    };

    const WeeklyChartCard = () => {
      const { labels, perDayPerCat } = computeWeeklyTotals();
      const canvasRef = useRef(null);
      const chartRef = useRef(null);
      useEffect(() => {
        const ctx = canvasRef.current.getContext("2d");
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        const datasets = db.categories.map(c => ({ label: c.name, data: perDayPerCat[c.id] }));
        chartRef.current = new Chart(ctx, {
          type: "bar",
          data: { labels, datasets },
          options: {
            responsive: true,
            plugins: { legend: { position: "bottom" }, title: { display: true, text: "Last 7 days (minutes) — stacked (by category)" } },
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
          }
        });
        return () => { if (chartRef.current) chartRef.current.destroy(); };
      }, [JSON.stringify(perDayPerCat), labels.join('|'), db.categories.map(c=>c.id).join('|')]);
      return React.createElement("div", { className:"card" },
        React.createElement("div", { className:"content" },
          React.createElement("div", { className:"weekchart-wrap" },
            React.createElement("canvas", { ref: canvasRef, width: 800, height: 360 })
          )
        )
      );
    };

    const TodayTab = () => React.createElement(React.Fragment, null,
      React.createElement(RunningNow,null),
      React.createElement("div",{style:{height:10}}),
      React.createElement(WeeklySummaryCard,null),
      React.createElement("div",{style:{height:10}}),
      React.createElement(WeeklyChartCard,null),
      React.createElement("div",{style:{height:10}}),
      React.createElement(ItemsTab,null),
      React.createElement("div",{style:{height:10}}),
      React.createElement(TodayChart,null)
    );

    return React.createElement("div", { className: "container" },
      React.createElement(Header, null),
      React.createElement("div", { className: "tabs" },
        ["today","items","projects","history","calendar"].map(t =>
          React.createElement("button", { key:t, className: `tab ${tab===t?"active":""}`, onClick: ()=>setTab(t)}, t[0].toUpperCase()+t.slice(1))
        )
      ),
      tab === "today" ? React.createElement(TodayTab, null) :
      tab === "items" ? React.createElement(ItemsTab, null) :
      tab === "projects" ? React.createElement(ProjectsTab, null) :
      tab === "history" ? React.createElement(HistoryTab, null) :
      React.createElement(CalendarTab, null),
      
      { showNoteModal && React.createElement("div", { className: "modal-backdrop" },
        React.createElement("div", { className: "modal" },
          React.createElement("div", { className: "content" },
            React.createElement("div", { style:{fontWeight:700, fontSize:18, marginBottom:6} }, "Add a note?"),
            React.createElement("div", { className:"small", style:{marginBottom:8} }, "Optional, but helpful to remember what you did."),
            React.createElement("textarea", { placeholder:"e.g. Deep work on CRM", value: noteText, onChange: e=>setNoteText(e.target.value) }),
            React.createElement("div", { className:"actions" },
              React.createElement("button", { onClick: cancelNote }, "Cancel"),
              React.createElement("button", { onClick: stopWithoutNote }, "Skip"),
              React.createElement("button", { className:"primary", onClick: saveNoteAndStop }, "Save note & stop")
            )
          )
        )
      ) }

      ,React.createElement("footer", null, "Project picker: choose/add a project inside each category. Add to Home Screen for app-like use.")
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(React.createElement(App));
})();