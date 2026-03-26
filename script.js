// ══════════════════════════════════════════════════════════════
//  PPMD — script.js
//  Google Apps Script-backed Project Proposal Monitoring Dashboard
// ══════════════════════════════════════════════════════════════

// ▼▼▼ SET THIS TO YOUR DEPLOYED WEB APP URL ▼▼▼
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbys9fcx53NC_ATgpcyvJGqJlQkWLScohQg_N4Sz2RfSJ1O-lGGXTcFkG-lv6YT7qXFWKA/exec";
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

document.addEventListener("DOMContentLoaded", () => {

  // ══════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════
  const FAV_KEY = "ppmd_fav_v1"; // localStorage only — student favorites

  let groups    = [];   // from Apps Script
  let rcData    = [];   // ratings & comments from Apps Script

  let currentRole    = null;
  let currentFaculty = null;
  let viewingGroupId = null;
  let pendingStarVal = 0;

  let activeStage = "all";
  let activeTag   = "all";
  let query       = "";
  let currentPage = 1;
  const PAGE_SIZE = 12;

  let favorites = loadLocal(FAV_KEY) || {};

  // ══════════════════════════════════════════════
  // LOCAL STORAGE HELPERS (for favorites only)
  // ══════════════════════════════════════════════
  function loadLocal(k) {
    try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; }
  }
  function saveLocal(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  // ══════════════════════════════════════════════
  // CONFIG CHECK
  // ══════════════════════════════════════════════
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "YOUR_APPS_SCRIPT_WEB_APP_URL_HERE") {
    document.getElementById("configBanner").classList.remove("hidden");
  }

  // ══════════════════════════════════════════════
  // ROLE SELECTION
  // ══════════════════════════════════════════════
  window.chooseRole = function(role) {
    if (role === "faculty") {
      closeOverlay("roleOverlay");
      openOverlay("nameOverlay");
      setTimeout(() => document.getElementById("nameInput").focus(), 300);
    } else {
      currentRole    = "student";
      currentFaculty = null;
      closeOverlay("roleOverlay");
      activateApp();
    }
  };

  window.back = function() {
    closeOverlay("nameOverlay");
    openOverlay("roleOverlay");
  };

  window.confirmName = function() {
    const name = document.getElementById("nameInput").value.trim();
    const err  = document.getElementById("nameErr");
    if (!name) { err.textContent = "⚠ Please enter your name."; return; }
    err.textContent = "";
    currentRole    = "faculty";
    currentFaculty = name;
    closeOverlay("nameOverlay");
    activateApp();
  };

  window.switchRole = function() {
    currentRole    = null;
    currentFaculty = null;
    document.getElementById("nameInput").value = "";
    document.getElementById("nameErr").textContent = "";
    openOverlay("roleOverlay");
    document.getElementById("appHeader").classList.add("hidden");
    document.getElementById("appBody").classList.add("hidden");
  };

  function activateApp() {
    applyRoleUI();
    document.getElementById("appHeader").classList.remove("hidden");
    document.getElementById("appBody").classList.remove("hidden");
    loadData();
  }

  function applyRoleUI() {
    const isFac   = currentRole === "faculty";
    const rl      = document.getElementById("roleLabel");
    const sw      = document.getElementById("roleSwitcher");
    const fc      = document.getElementById("facControls");

    if (currentRole === "faculty") {
      rl.textContent = `Faculty — ${currentFaculty}`;
      sw.textContent = `👩‍🏫 ${currentFaculty} · Switch`;
      sw.className   = "role-switcher fac";
      fc.classList.remove("hidden");
    } else {
      rl.textContent = "Student View — read only";
      sw.textContent = "🎓 Student · Switch";
      sw.className   = "role-switcher stu";
      fc.classList.add("hidden");
    }
  }

  // ══════════════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════════════
  window.loadData = async function() {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "YOUR_APPS_SCRIPT_WEB_APP_URL_HERE") {
      showError("Apps Script URL not configured. Please set APPS_SCRIPT_URL in script.js.");
      return;
    }

    showLoading();
    try {
      const res  = await fetch(APPS_SCRIPT_URL);
      const data = await res.json();
      if (data.status !== "ok") throw new Error(data.message || "API error");

      groups = data.groups  || [];
      rcData = data.comments || [];

      hideLoading();
      renderGrid();
    } catch (err) {
      showError("Failed to load data: " + err.message);
    }
  };

  function showLoading() {
    document.getElementById("loadingState").classList.remove("hidden");
    document.getElementById("errorState").classList.add("hidden");
    document.getElementById("sectionHead").style.display = "none";
    document.getElementById("cardGrid").innerHTML = "";
    document.getElementById("pagination").style.display = "none";
  }

  function hideLoading() {
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("sectionHead").style.display = "flex";
  }

  function showError(msg) {
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("errorState").classList.remove("hidden");
    document.getElementById("errorMsg").textContent = msg;
  }

  // ══════════════════════════════════════════════
  // DATA HELPERS
  // ══════════════════════════════════════════════
  function avgRating(gid) {
    const rows = rcData.filter(r => r.groupId === gid && r.rating !== null && r.rating !== "");
    if (!rows.length) return 0;
    return rows.reduce((s, r) => s + Number(r.rating), 0) / rows.length;
  }

  function allComments(gid) {
    return rcData.filter(r => r.groupId === gid && r.comment && r.comment.trim());
  }

  function myRating(gid) {
    const row = rcData.find(r => r.groupId === gid && r.faculty === currentFaculty && r.rating !== null && r.rating !== "");
    return row ? Number(row.rating) : 0;
  }

  function myComments(gid) {
    return rcData.filter(r => r.groupId === gid && r.faculty === currentFaculty && r.comment && r.comment.trim());
  }

  // ══════════════════════════════════════════════
  // SEARCH & FILTER WIRING
  // ══════════════════════════════════════════════
  document.getElementById("searchInput").addEventListener("input", function() {
    query = this.value.trim().toLowerCase();
    currentPage = 1;
    renderGrid();
  });

  window.setStage = function(stage) {
    activeStage = stage;
    currentPage = 1;
    document.querySelectorAll(".tab").forEach(b =>
      b.classList.toggle("active", b.dataset.stage === stage));
    renderGrid();
  };

  window.toggleTagMenu = function() {
    document.getElementById("tagBtn").classList.toggle("open");
    document.getElementById("tagMenu").classList.toggle("open");
  };

  document.addEventListener("click", e => {
    if (!e.target.closest("#tagWrap")) {
      document.getElementById("tagBtn").classList.remove("open");
      document.getElementById("tagMenu").classList.remove("open");
    }
  });

  function buildTagMenu() {
    const used = [...new Set(groups.map(g => g.tag).filter(Boolean))].sort();
    const menu = document.getElementById("tagMenu");
    menu.innerHTML = [
      `<button class="tag-item${activeTag === "all" ? " active" : ""}" onclick="setTagFilter('all')">🏷 All Tags</button>`,
      ...used.map(t => `<button class="tag-item${activeTag === t ? " active" : ""}" onclick="setTagFilter('${t.replace(/'/g, "\\'")}')">${t}</button>`)
    ].join("");
    if (!used.length) menu.innerHTML += `<span style="display:block;padding:10px 16px;font-size:12px;color:var(--sub)">No tags yet</span>`;
  }

  window.setTagFilter = function(tag) {
    activeTag = tag;
    document.getElementById("tagLabel").textContent = tag === "all" ? "All Tags" : tag;
    document.getElementById("tagBtn").classList.toggle("active-f", tag !== "all");
    document.getElementById("tagBtn").classList.remove("open");
    document.getElementById("tagMenu").classList.remove("open");
    currentPage = 1;
    renderGrid();
  };

  // ══════════════════════════════════════════════
  // RENDER GRID
  // ══════════════════════════════════════════════
  function updateStats() {
    const total = groups.length;
    const rated = groups.filter(g => avgRating(g.groupId) > 0).length;
    document.getElementById("stTotal").textContent   = total;
    document.getElementById("stRated").textContent   = rated;
    document.getElementById("stUnrated").textContent = total - rated;
    document.getElementById("statsEnrolled").textContent =
      `AY 2026–2027 · ${total} group${total !== 1 ? "s" : ""} enrolled`;
  }

  function renderGrid() {
    updateStats();
    buildTagMenu();

    let list = groups;
    if (activeStage !== "all") list = list.filter(g => g.stage === activeStage);
    if (activeTag   !== "all") list = list.filter(g => g.tag   === activeTag);
    if (query) list = list.filter(g =>
      g.title.toLowerCase().includes(query) || (g.groupId || "").toLowerCase().includes(query));

    const stagePart = activeStage === "all" ? "All Projects" : activeStage;
    const tagPart   = activeTag   !== "all" ? ` — ${activeTag}` : "";
    document.getElementById("sectionLbl").textContent =
      query ? `Results for "${query}"` : stagePart + tagPart;

    const grid = document.getElementById("cardGrid");

    if (!list.length) {
      grid.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>${groups.length ? "No results found" : "No groups yet"}</h3>
        <p>${groups.length ? "Try a different search or filter." : "Add rows to the Groups sheet and refresh."}</p>
      </div>`;
      document.getElementById("pagination").style.display = "none";
      return;
    }

    const totalPages = Math.ceil(list.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start    = (currentPage - 1) * PAGE_SIZE;
    const pageList = list.slice(start, start + PAGE_SIZE);

    grid.innerHTML = pageList.map((g, i) => cardHTML(g, start + i)).join("");

    pageList.forEach(g => {
      const el = document.getElementById("card-" + g.groupId);
      if (el) el.addEventListener("click", () => openCardModal(g.groupId));
    });

    renderPagination(list.length, totalPages);
  }

  // ══════════════════════════════════════════════
  // SVG FALLBACK THUMBS
  // ══════════════════════════════════════════════
  const TC = [["#eef2ff","#c7d2fe"],["#d1fae5","#a7f3d0"],["#fef3c7","#fde68a"],
              ["#fee2e2","#fecaca"],["#ede9fe","#ddd6fe"],["#fce7f3","#fbcfe8"],["#dbeafe","#bfdbfe"]];
  const TI = ["💡","📊","🖥️","🔬","🌐","📱","🤖","🔧","📡","🛰️","🧬","🗺️"];

  function svgThumb(i) {
    const [c1, c2] = TC[i % TC.length], ic = TI[i % TI.length], uid = "sv" + i;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 202">
        <defs><linearGradient id="${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${c1}"/>
          <stop offset="100%" style="stop-color:${c2}"/>
        </linearGradient></defs>
        <rect width="360" height="202" fill="url(#${uid})"/>
        <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="48">${ic}</text>
      </svg>`);
  }

  function starsHTML(val, cls = "star-d", size = "") {
    return Array.from({length: 5}, (_, i) =>
      `<span class="${cls}${i < Math.round(val) ? " on" : ""}" ${size}>${"★"}</span>`
    ).join("");
  }

  function cardHTML(g, i) {
    const avg   = avgRating(g.groupId);
    const delay = Math.min(i * 0.04, 0.5);
    const cc    = allComments(g.groupId).length;
    const thumb = svgThumb(i);
    return `
    <div class="card" id="card-${g.groupId}" style="animation-delay:${delay}s">
      <div class="card-thumb">
        <img src="${thumb}" alt="${g.title}"/>
        <div class="card-badge">${g.tag || "—"}</div>
      </div>
      <div class="card-body">
        <div class="card-gnum">Group ${g.groupId}</div>
        <div class="card-title">${g.title}</div>
        <div class="card-desc">${g.description}</div>
      </div>
      <div class="card-foot">
        <div class="card-stars">${starsHTML(avg)}</div>
        <div style="display:flex;align-items:center;gap:8px">
          ${avg > 0 ? `<span class="card-avg">${avg.toFixed(1)}</span>` : `<span class="card-unrated">Unrated</span>`}
          ${cc > 0 ? `<span class="card-ccount">💬 ${cc}</span>` : ""}
        </div>
      </div>
    </div>`;
  }

  // ══════════════════════════════════════════════
  // PAGINATION
  // ══════════════════════════════════════════════
  function renderPagination(total, totalPages) {
    const bar = document.getElementById("pagination");
    if (totalPages <= 1) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end   = Math.min(currentPage * PAGE_SIZE, total);
    document.getElementById("pageInfo").textContent = `Showing ${start}–${end} of ${total}`;
    document.getElementById("pgPrev").disabled = currentPage === 1;
    document.getElementById("pgNext").disabled = currentPage === totalPages;

    const range = [], d = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - d && i <= currentPage + d)) range.push(i);
    }
    const withEll = []; let prev = null;
    for (const p of range) {
      if (prev !== null && p - prev > 1) withEll.push("…");
      withEll.push(p); prev = p;
    }
    document.getElementById("pgNums").innerHTML = withEll.map(p =>
      p === "…" ? `<span class="pg-ell">…</span>`
                : `<button class="pg-num${p === currentPage ? " active" : ""}" onclick="goToPage(${p})">${p}</button>`
    ).join("");
  }

  window.changePage = function(dir) {
    let list = groups;
    if (activeStage !== "all") list = list.filter(g => g.stage === activeStage);
    if (activeTag   !== "all") list = list.filter(g => g.tag   === activeTag);
    if (query) list = list.filter(g => g.title.toLowerCase().includes(query) || (g.groupId || "").toLowerCase().includes(query));
    const tp = Math.ceil(list.length / PAGE_SIZE);
    currentPage = Math.max(1, Math.min(currentPage + dir, tp));
    renderGrid(); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.goToPage = function(p) {
    currentPage = p; renderGrid(); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ══════════════════════════════════════════════
  // CARD DETAIL MODAL
  // ══════════════════════════════════════════════
  function openCardModal(gid) {
    const g = groups.find(x => x.groupId === gid);
    if (!g) return;
    viewingGroupId = gid;

    const i     = groups.indexOf(g);
    const avg   = avgRating(gid);

    document.getElementById("cmHeroImg").src         = svgThumb(i);
    document.getElementById("cmHeroBadge").textContent = g.tag || "—";
    document.getElementById("cmGroup").textContent   = `Group ${g.groupId}`;
    document.getElementById("cmStagePill").textContent = g.stage || "—";
    document.getElementById("cmTitle").textContent   = g.title;
    document.getElementById("cmDesc").textContent    = g.description;

    document.getElementById("cmAvgStars").innerHTML = starsHTML(avg, "star-d");
    document.getElementById("cmAvgVal").textContent = avg > 0 ? `${avg.toFixed(1)} / 5` : "No ratings yet";

    const isFac = currentRole === "faculty";
    document.getElementById("facPanel").classList.toggle("hidden", !isFac);
    document.getElementById("stuPanel").classList.toggle("hidden", currentRole !== "student");

    if (isFac)                    renderFacPanel(gid);
    if (currentRole === "student") renderStuPanel(gid);

    openOverlay("cardOverlay");
  }

  // ── Faculty Panel ────────────────────────────
  function renderFacPanel(gid) {
    const existingRating = myRating(gid);
    pendingStarVal       = existingRating;

    const stars = [...document.querySelectorAll("#cmStarInput .si")];
    const note  = document.getElementById("facRatingNote");

    stars.forEach(s => {
      s.classList.toggle("on", +s.dataset.v <= existingRating);
      s.onclick = e => {
        e.stopPropagation();
        pendingStarVal = +s.dataset.v;
        stars.forEach(x => x.classList.toggle("on", +x.dataset.v <= pendingStarVal));
      };
    });

    note.textContent = existingRating > 0
      ? `Your current rating: ${existingRating}/5 — saving will update it.`
      : "";

    // My previous comments
    const mine  = myComments(gid);
    const mList = document.getElementById("myComments");
    if (mine.length) {
      mList.innerHTML = mine.map(c =>
        `<div class="my-comment-item">${c.comment}</div>`
      ).join("");
    } else {
      mList.innerHTML = `<p class="no-my-comments">You haven't commented yet.</p>`;
    }

    document.getElementById("cmCommentIn").value = "";
    document.getElementById("savedToast").classList.remove("show");
  }

  window.submitFacultyFeedback = async function() {
    const gid     = viewingGroupId;
    const comment = document.getElementById("cmCommentIn").value.trim();
    const rating  = pendingStarVal || null;

    if (!rating && !comment) {
      alert("Please add a rating or a comment before saving.");
      return;
    }

    const payload = { groupId: gid, faculty: currentFaculty };
    if (rating)  payload.rating  = rating;
    if (comment) payload.comment = comment;

    try {
      const res  = await fetch(APPS_SCRIPT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status !== "ok") throw new Error(data.message || "Save failed");

      // Refresh data silently
      const refreshed = await fetch(APPS_SCRIPT_URL);
      const rd        = await refreshed.json();
      if (rd.status === "ok") {
        groups = rd.groups  || [];
        rcData = rd.comments || [];
      }

      document.getElementById("savedToast").classList.add("show");
      setTimeout(() => document.getElementById("savedToast").classList.remove("show"), 2200);

      // Re-render panel & stats
      renderFacPanel(gid);
      updateStats();
      renderGrid();

      // Update avg in open modal
      const avg = avgRating(gid);
      document.getElementById("cmAvgStars").innerHTML = starsHTML(avg, "star-d");
      document.getElementById("cmAvgVal").textContent = avg > 0 ? `${avg.toFixed(1)} / 5` : "No ratings yet";

    } catch (err) {
      alert("Error saving: " + err.message);
    }
  };

  // ── Student Panel ────────────────────────────
  function renderStuPanel(gid) {
    const all     = allComments(gid);
    const favName = favorites[gid] || null;
    const listEl  = document.getElementById("stuCommentsList");
    const noEl    = document.getElementById("stuNoComments");
    const favEl   = document.getElementById("stuFavNote");

    if (!all.length) {
      listEl.innerHTML = "";
      noEl.classList.remove("hidden");
    } else {
      noEl.classList.add("hidden");
      listEl.innerHTML = all.map((c, idx) => {
        const isFav = favName === c.faculty;
        return `
        <div class="comment-card${isFav ? " fav-on" : ""}">
          <div class="cc-top">
            <span class="cc-anon">Anonymous Faculty ${idx + 1}</span>
            <div class="cc-stars">${starsHTML(c.rating || 0)}</div>
          </div>
          <div class="cc-text">${c.comment || "<em style='color:var(--sub)'>No text.</em>"}</div>
          <button class="fav-btn${isFav ? " fav-on" : ""}" onclick="toggleFav('${gid}','${c.faculty}',${idx})">
            ${isFav ? "❤️ Favorited" : "🤍 Favorite"}
          </button>
        </div>`;
      }).join("");
    }

    if (favName) {
      const idx = all.findIndex(c => c.faculty === favName);
      favEl.innerHTML = `<div class="fav-selected">❤️ You favorited <strong>Anonymous Faculty ${idx + 1}'s</strong> comment — they could be your advisor.</div>`;
    } else {
      favEl.innerHTML = `<span style="font-size:13px;color:var(--sub)">Tap ❤️ on a comment to mark a favorite.</span>`;
    }
  }

  window.toggleFav = function(gid, facultyName, idx) {
    favorites[gid] = favorites[gid] === facultyName ? undefined : facultyName;
    if (!favorites[gid]) delete favorites[gid];
    saveLocal(FAV_KEY, favorites);
    renderStuPanel(gid);
  };

  // ══════════════════════════════════════════════
  // ADD GROUP MODAL (info only — data from Sheets)
  // ══════════════════════════════════════════════
  window.openAddModal = function() {
    if (currentRole !== "faculty") return;
    openOverlay("addOverlay");
  };

  // ══════════════════════════════════════════════
  // EXPORT TO XLSX
  // ══════════════════════════════════════════════
  window.exportXLSX = function() {
    const rows = groups.map(g => {
      const avg  = avgRating(g.groupId);
      const all  = allComments(g.groupId);
      const rcs  = rcData.filter(r => r.groupId === g.groupId && r.rating !== null && r.rating !== "");

      const row = {
        "Group ID":      g.groupId,
        "Title":         g.title,
        "Description":   g.description,
        "Tag":           g.tag,
        "Stage":         g.stage,
        "Avg Rating":    avg > 0 ? +avg.toFixed(2) : "",
        "Total Reviews": rcs.length,
        "Total Comments": all.length,
      };
      rcs.forEach(r => { row[`Rating — ${r.faculty}`]  = r.rating  || ""; });
      all.forEach(c => { row[`Comment — ${c.faculty}`] = c.comment || ""; });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PPMD Export");
    XLSX.writeFile(wb, `PPMD_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // Import from XLSX (reads group data locally, for preview)
  const xlsxUp = document.getElementById("xlsxUp");
  if (xlsxUp) xlsxUp.addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb    = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data  = XLSX.utils.sheet_to_json(sheet);
        alert(`📊 This file has ${data.length} rows.\n\nTo import groups, add them directly in your Google Sheets "Groups" tab, then click Refresh.`);
      } catch (err) {
        alert("Could not read file: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsArrayBuffer(f);
  });

  // ══════════════════════════════════════════════
  // OVERLAY HELPERS
  // ══════════════════════════════════════════════
  window.openOverlay  = id => document.getElementById(id).classList.add("open");
  window.closeOverlay = id => document.getElementById(id).classList.remove("open");
  window.overlayClick = (e, id) => { if (e.target.id === id) closeOverlay(id); };

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      ["cardOverlay","addOverlay","nameOverlay"].forEach(closeOverlay);
    }
  });

  // Enter key in name input
  document.getElementById("nameInput").addEventListener("keydown", e => {
    if (e.key === "Enter") window.confirmName();
  });

});