document.addEventListener("DOMContentLoaded", () => {
  // ── PERSISTENCE KEYS ──
  const GK = 'cap_groups_v3', RK = 'cap_ratings_v3', CK = 'cap_comments_v3';

  // ── DATA LOADING ──
  const load = k => {
    try { return JSON.parse(localStorage.getItem(k)) || null; }
    catch(e) { return null; }
  };
  const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let groups   = load(GK) || [];
  let ratings  = load(RK) || {};
  let comments = load(CK) || {};

  // ── STATE ──
  let activeStage = 'all';   // controls the tab filter (All / Capstone 1 / SE1)
  let activeTag   = 'all';   // controls the dropdown tag filter
  let query       = '';
  let currentPage = 1;
  const PAGE_SIZE = 10;
  let pendingDel  = null;
  let thumbData   = null;

// Helper to find data regardless of column name casing (e.g., "title" vs "Title")
function getCellValue(row, variations) {
  const key = Object.keys(row).find(k => 
    variations.some(v => k.toLowerCase().trim() === v.toLowerCase())
  );
  return key ? row[key] : null;
}

// UNIQUE ID
async function fetchGroups() {
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTsuxgyDT3wSPVxstsNG3RZhYSYYwcEEfp3lQgoqwWYTSf4co7p8NUdg9v-WPW0mIbIF9MDcVhRaoYR/pub?output=csv';

  try {
    console.log("Fetching data from Google Sheets...");
    const res = await fetch(SHEET_URL);
    
    if (!res.ok) throw new Error("Could not fetch sheet. Make sure it is Published to Web as CSV.");
    
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const data = parsed.data;

    if (data.length === 0) {
      console.warn("Sheet is empty or headers don't match.");
    }

    // Map data with flexible header names
    const sheetGroups = data.map((row, i) => {
      const gNum = getCellValue(row, ["Group Number", "Group No", "Group", "group"]) || "N/A";
      return {
        // Use Group Number + Title as ID so it's unique but persistent
        id: "sheet-" + gNum.toString().replace(/\s+/g, '-'),
        groupNum: gNum,
        title: getCellValue(row, ["Title", "Project Title", "Project"]) || "Untitled Project",
        desc:  getCellValue(row, ["Description", "Desc", "Abstract"]) || "No description.",
        tag:   getCellValue(row, ["Tag", "Category", "Type"]) || "Other",
        stage: getCellValue(row, ["Stage", "Status", "Year"]) || "Capstone 1",
        thumb: null
      };
    });

    // Save to global variable
    groups = sheetGroups;
    
    // Save a backup to local storage
    localStorage.setItem('cap_groups_v3', JSON.stringify(groups));
    
    console.log("Successfully loaded " + groups.length + " groups.");
    renderGrid();

  } catch (e) {
    console.error("Error loading Google Sheet:", e);
    // If it fails, try to load from the last successful cache
    const cached = localStorage.getItem('cap_groups_v3');
    if (cached) {
      groups = JSON.parse(cached);
      renderGrid();
    } else {
      document.getElementById('cardGrid').innerHTML = `<p style="color:red; text-align:center;">Failed to load data. Please check your internet or Google Sheet settings.</p>`;
    }
  }
}

// Update the Init function
document.addEventListener("DOMContentLoaded", () => {
  // Load ratings/comments first
  ratings = JSON.parse(localStorage.getItem('cap_ratings_v3')) || {};
  comments = JSON.parse(localStorage.getItem('cap_comments_v3')) || {};

  // Trigger the live fetch
  fetchGroups();
});

// ── MODIFIED SUBMIT GROUP (for local additions) ──
window.submitGroup = function() {
    // ... (keep your validation logic)
    
    const newGroup = {
      id:       'manual_' + Date.now(), // Prefix to distinguish from sheet groups
      groupNum: gn,
      title:    ti,
      desc:     de,
      tag:      tg,
      stage:    st,
      thumb:    thumbData || null
    };

    groups.push(newGroup);
    // We save the WHOLE groups array so manual ones persist after refresh
    localStorage.setItem(GK, JSON.stringify(groups)); 
    
    closeModal('addModal');
    renderGrid();
};

  // ── UPDATED EXCEL UPLOAD ──
function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);
    
    importExcelData(jsonData);
    e.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function importExcelData(data) {
  if (!data.length) return;

  let addedCount = 0;

  data.forEach((row) => {
    // 1. Clean the Group Number to use as a Unique ID
    const rawGroupNum = row["Group Number"] || row["group"] || "N/A";
    const cleanId = rawGroupNum.toString().trim().replace(/\s+/g, '-');

    // 2. Check if this group already exists (prevent duplicates)
    const exists = groups.some(g => g.id === cleanId);
    
    if (!exists) {
      groups.push({
        id:       cleanId, // Consistent ID for ratings
        groupNum: rawGroupNum,
        title:    row["Title"]        || row["title"]       || "Untitled Project",
        desc:     row["Description"]  || row["desc"]        || "No description provided.",
        tag:      row["Tag"]          || row["tag"]         || "Other",
        stage:    row["Stage"]        || row["stage"]       || "Capstone 1",
        thumb:    null
      });
      addedCount++;
    }
  });

  // 3. Persist the combined list (Google Sheet + Manual + Excel)
  localStorage.setItem(GK, JSON.stringify(groups));
  
  renderGrid();
  alert(`✅ Processed ${data.length} rows. Added ${addedCount} new groups.`);
}

  // ── FALLBACK SVG THUMBS ──
  const TC = [['#eef2ff','#c7d2fe'],['#d1fae5','#a7f3d0'],['#fef3c7','#fde68a'],
              ['#fee2e2','#fecaca'],['#ede9fe','#ddd6fe'],['#fce7f3','#fbcfe8'],['#dbeafe','#bfdbfe']];
  const TI = ['💡','📊','🖥️','🔬','🌐','📱','🤖','🔧','📡','🛰️','🧬','🗺️'];

  function svgThumb(i) {
    const [c1, c2] = TC[i % TC.length], ic = TI[i % TI.length], uid = 'svg_' + i;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 202">
        <defs><linearGradient id="${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${c1}"/>
          <stop offset="100%" style="stop-color:${c2}"/>
        </linearGradient></defs>
        <rect width="360" height="202" fill="url(#${uid})"/>
        <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="48">${ic}</text>
      </svg>`);
  }

  // ── SEARCH ──
  document.getElementById('searchInput').addEventListener('input', function() {
    query = this.value.trim().toLowerCase();
    currentPage = 1;
    renderGrid();
  });

  // ── STAGE TABS ──
  window.setStage = function(stage) {
    activeStage = stage;
    currentPage = 1;
    document.querySelectorAll('.filter-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.stage === stage);
    });
    renderGrid();
  };

  // ── TAG DROPDOWN ──
  window.toggleTagDropdown = function() {
    const btn = document.getElementById('tagFilterBtn');
    const dd  = document.getElementById('tagDropdown');
    btn.classList.toggle('open');
    dd.classList.toggle('open');
  };

  function buildTagDropdown() {
    // Collect unique tags actually used by groups, sorted alphabetically
    const usedTags = [...new Set(groups.map(g => g.tag).filter(Boolean))].sort();

    const dd = document.getElementById('tagDropdown');
    dd.innerHTML = [
      // Always-first "All Tags" option
      `<button class="tag-option${activeTag === 'all' ? ' active' : ''}" data-tag="all" onclick="setTagFilter('all')">🏷 All Tags</button>`,
      // One button per unique tag found in groups data
      ...usedTags.map(t =>
        `<button class="tag-option${activeTag === t ? ' active' : ''}" data-tag="${t}" onclick="setTagFilter('${t.replace(/'/g, "\\'")}')">${t}</button>`
      )
    ].join('');

    // Show a placeholder if no groups exist yet
    if (!usedTags.length) {
      dd.innerHTML += `<span class="tag-dropdown-empty">No tags yet — add a group first.</span>`;
    }
  }

  window.setTagFilter = function(tag) {
    activeTag = tag;

    // update button label + active style
    document.getElementById('tagFilterLabel').textContent = tag === 'all' ? '🏷 All Tags' : '🏷 ' + tag;
    document.getElementById('tagFilterBtn').classList.toggle('active-filter', tag !== 'all');

    currentPage = 1;

    // close dropdown
    document.getElementById('tagFilterBtn').classList.remove('open');
    document.getElementById('tagDropdown').classList.remove('open');

    renderGrid();
  };

  // close tag dropdown when clicking outside
  document.addEventListener('click', e => {
    const wrap = document.getElementById('tagFilterWrap');
    if (wrap && !wrap.contains(e.target)) {
      document.getElementById('tagFilterBtn').classList.remove('open');
      document.getElementById('tagDropdown').classList.remove('open');
    }
  });

  // ── STATS ──
  function updateStats() {
    const total = groups.length;
    const rated = groups.filter(g => (ratings[g.id] || 0) > 0).length;
    document.getElementById('statTotal').textContent   = total;
    document.getElementById('statRated').textContent   = rated;
    document.getElementById('statUnrated').textContent = total - rated;
    document.getElementById('enrolledLabel').textContent =
      `AY 2026–2027 · ${total} group${total !== 1 ? 's' : ''} enrolled`;
  }

  // ── RENDER ENGINE ──
  function renderGrid() {
    updateStats();
    buildTagDropdown();

    let list = groups;

    // 1. Stage tab filter
    if (activeStage !== 'all') list = list.filter(g => g.stage === activeStage);

    // 2. Tag dropdown filter
    if (activeTag !== 'all') list = list.filter(g => g.tag === activeTag);

    // 3. Search filter
    if (query) list = list.filter(g =>
      g.title.toLowerCase().includes(query) || g.groupNum.toLowerCase().includes(query));

    // Section label
    const stagePart = activeStage === 'all' ? 'All Projects' : activeStage;
    const tagPart   = activeTag   !== 'all' ? ` — ${activeTag}` : '';
    document.getElementById('sectionLabel').textContent =
      query ? `Results for "${query}"` : stagePart + tagPart;

    const grid = document.getElementById('cardGrid');
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>${groups.length ? 'No results found' : 'No groups yet'}</h3>
        <p>${groups.length ? 'Try a different search or filter.' : 'Click "+ Add Group" or "Import Excel" to start.'}</p>
      </div>`;
      document.getElementById('pagination').style.display = 'none';
      return;
    }

    // ── PAGINATION ──
    const totalPages = Math.ceil(list.length / PAGE_SIZE);
    // clamp currentPage in case filters reduced total
    if (currentPage > totalPages) currentPage = totalPages;

    const start   = (currentPage - 1) * PAGE_SIZE;
    const pageList = list.slice(start, start + PAGE_SIZE);

    grid.innerHTML = pageList.map((g, i) => cardHTML(g, start + i)).join('');

    // ── Attach card click listeners (avoids inline onclick ID escaping bugs) ──
    pageList.forEach(g => {
      const cardEl = document.getElementById('card-' + g.id);
      if (cardEl) {
        cardEl.addEventListener('click', () => toggleCard(g.id));
      }
    });

    // Wire up star ratings after DOM paint
    pageList.forEach(g => {
      const row = document.querySelector(`.star-row[data-id="${g.id}"]`);
      if (!row) return;
      const stars = [...row.querySelectorAll('.star')];
      const saved = ratings[g.id] || 0;
      stars.forEach((s, i) => { if (i < saved) s.classList.add('active'); });
      stars.forEach(star => {
        star.addEventListener('click', e => {
          e.stopPropagation();
          const v = +star.dataset.val;
          ratings[g.id] = v;
          persist(RK, ratings);
          stars.forEach((s, i) => s.classList.toggle('active', i < v));
          updateStats();
        });
      });
    });

    // ── RENDER PAGINATION BAR ──
    renderPagination(list.length, totalPages);
  }

  function renderPagination(total, totalPages) {
    const bar      = document.getElementById('pagination');
    const info     = document.getElementById('paginationInfo');
    const numbers  = document.getElementById('pageNumbers');
    const prevBtn  = document.getElementById('prevBtn');
    const nextBtn  = document.getElementById('nextBtn');

    if (totalPages <= 1) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';

    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end   = Math.min(currentPage * PAGE_SIZE, total);
    info.textContent = `Showing ${start}–${end} of ${total} groups`;

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;

    // Page number buttons — show up to 5 around current page
    const range = [];
    const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    // Insert ellipsis markers
    const withEllipsis = [];
    let prev = null;
    for (const page of range) {
      if (prev !== null && page - prev > 1) withEllipsis.push('…');
      withEllipsis.push(page);
      prev = page;
    }

    numbers.innerHTML = withEllipsis.map(p =>
      p === '…'
        ? `<span class="page-ellipsis">…</span>`
        : `<button class="page-num${p === currentPage ? ' active' : ''}" onclick="goToPage(${p})">${p}</button>`
    ).join('');
  }

  window.changePage = function(dir) {
    const totalPages = Math.ceil(
      groups
        .filter(g => activeStage === 'all' || g.stage === activeStage)
        .filter(g => activeTag   === 'all' || g.tag   === activeTag)
        .filter(g => !query || g.title.toLowerCase().includes(query) || g.groupNum.toLowerCase().includes(query))
        .length / PAGE_SIZE
    );
    currentPage = Math.max(1, Math.min(currentPage + dir, totalPages));
    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.goToPage = function(page) {
    currentPage = page;
    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function cardHTML(g, i) {
    const thumb = g.thumb || svgThumb(i);
    const com   = comments[g.id] || '';
    const delay = Math.min(i * 0.05, 0.5);
    return `
    <div class="card" id="card-${g.id}" style="animation-delay:${delay}s">
      <div class="card-thumb">
        <img src="${thumb}" alt="${g.title}" onerror="this.src='${svgThumb(i)}'"/>
        <div class="thumb-badge">${g.tag || '—'}</div>
      </div>
      <div class="card-body">
        <div class="card-group-num">Group ${g.groupNum}</div>
        <div class="card-title">${g.title}</div>
        <div class="card-desc">${g.desc}</div>
      </div>
      <div class="card-expand">
        <div class="card-divider"></div>
        <div class="card-details">
          <div class="detail-row">
            <span class="detail-label">🎓 Stage</span>
            <span class="detail-value">${g.stage || '—'}</span>
          </div>
          <div class="detail-row col">
            <span class="detail-label">⭐ Rate this Proposal</span>
            <div class="star-row" data-id="${g.id}" onclick="event.stopPropagation()">
              <span class="star" data-val="1">★</span>
              <span class="star" data-val="2">★</span>
              <span class="star" data-val="3">★</span>
              <span class="star" data-val="4">★</span>
              <span class="star" data-val="5">★</span>
            </div>
          </div>
          <div class="detail-row col">
            <span class="detail-label">💬 Comment</span>
            <textarea class="comment-box" id="com-${g.id}" placeholder="Write your feedback on this proposal…" onclick="event.stopPropagation()">${com}</textarea>
          </div>
          <div class="action-row" onclick="event.stopPropagation()">
            <button class="save-btn" onclick="saveComment('${g.id}')">Save</button>
            <span class="saved-msg" id="smsg-${g.id}">✓ Saved</span>
            <button class="delete-btn" onclick="askDelete('${g.id}')">🗑 Delete</button>
          </div>
        </div>
      </div>
      <div class="expand-indicator">▾</div>
    </div>`;
  }

  window.toggleCard = function(id) {
    const el = document.getElementById('card-' + id);
    if (!el) return;
    const isExpanded = el.classList.contains('expanded');
    // Only collapse cards inside the live grid
    document.querySelectorAll('#cardGrid .card.expanded').forEach(c => c.classList.remove('expanded'));
    if (!isExpanded) el.classList.add('expanded');
  };

  window.saveComment = function(id) {
    const ta = document.getElementById('com-' + id);
    if (!ta) return;
    comments[id] = ta.value;
    persist(CK, comments);
    const m = document.getElementById('smsg-' + id);
    if (m) { m.classList.add('show'); setTimeout(() => m.classList.remove('show'), 2000); }
  };

  // ── DELETE ──
  window.askDelete = function(id) { pendingDel = id; openModal('delModal'); };
  window.confirmDelete = function() {
    if (!pendingDel) return;
    groups = groups.filter(g => g.id !== pendingDel);
    persist(GK, groups);
    delete ratings[pendingDel];  persist(RK, ratings);
    delete comments[pendingDel]; persist(CK, comments);
    pendingDel = null;
    currentPage = 1;
    closeModal('delModal');
    renderGrid();
  };

  // ── TAG SELECT — show/hide custom input ──
  window.handleTagChange = function() {
    const val  = document.getElementById('fTag').value;
    const wrap = document.getElementById('customTagWrap');
    const inp  = document.getElementById('fCustomTag');
    if (val === 'Other') {
      wrap.style.display = 'block';
      inp.focus();
    } else {
      wrap.style.display = 'none';
      inp.value = '';
    }
  };

  // ── ADD GROUP MODAL ──
  window.openAddModal = function() {
    ['fGroupNum', 'fTitle', 'fDesc'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fTag').value          = '';
    document.getElementById('fStage').value        = '';
    document.getElementById('fCustomTag').value    = '';
    document.getElementById('customTagWrap').style.display = 'none';
    document.getElementById('formErr').style.display = 'none';
    clearThumb();
    openModal('addModal');
  };

  window.onThumbPick = function(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      thumbData = ev.target.result;
      const p = document.getElementById('thumbPreview');
      p.src = thumbData; p.classList.add('show');
      document.getElementById('removeThumbBtn').style.display = 'block';
    };
    r.readAsDataURL(f);
  };

  window.clearThumb = function() {
    thumbData = null;
    const p = document.getElementById('thumbPreview');
    p.src = ''; p.classList.remove('show');
    document.getElementById('removeThumbBtn').style.display = 'none';
    document.getElementById('thumbFile').value = '';
  };

  window.submitGroup = function() {
    const gn  = document.getElementById('fGroupNum').value.trim();
    const ti  = document.getElementById('fTitle').value.trim();
    const de  = document.getElementById('fDesc').value.trim();
    const tgRaw = document.getElementById('fTag').value;
    const st  = document.getElementById('fStage').value;
    const er  = document.getElementById('formErr');

    // Resolve final tag — use custom input if "Other" was chosen
    const customTag = document.getElementById('fCustomTag').value.trim();
    const tg = tgRaw === 'Other' ? customTag : tgRaw;

    if (!gn || !ti || !de || !tgRaw || !st) {
      er.textContent = '⚠ Please fill in all fields.';
      er.style.display = 'block';
      return;
    }

    // Extra check: if Other selected but custom tag is empty
    if (tgRaw === 'Other' && !customTag) {
      er.textContent = '⚠ Please enter a custom tag name.';
      er.style.display = 'block';
      document.getElementById('fCustomTag').focus();
      return;
    }

    er.style.display = 'none';

    groups.push({
      id:       generateId('manual'),
      groupNum: gn,
      title:    ti,
      desc:     de,
      tag:      tg,
      stage:    st,
      thumb:    thumbData || null
    });

    persist(GK, groups);
    currentPage = 1;
    closeModal('addModal');
    renderGrid();
  };

  // ── MODAL UTILS ──
  window.openModal    = id => document.getElementById(id).classList.add('open');
  window.closeModal   = id => document.getElementById(id).classList.remove('open');
  window.overlayClick = (e, id) => { if (e.target.id === id) closeModal(id); };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal('addModal'); closeModal('delModal'); }
  });

  // ── INIT ──
  (async function init() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '<p>Loading projects…</p>';

    try {
      await fetchGroups();
    } catch(e) {
      console.error(e);
      grid.innerHTML = `<div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load projects</h3>
        <p>Check your internet connection or the Google Sheet URL.</p>
      </div>`;
    }
    // If fetchGroups succeeded but no groups, renderGrid will handle empty state
  })();
});