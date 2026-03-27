document.addEventListener("DOMContentLoaded", () => {
  const API_URL = 'https://script.google.com/macros/s/AKfycbzzZDzBiZDib_re6rZ91FYg6uNkyEsB5uZMCpKyKym2N8v2cZpVBMGvu5DElOvz5IOQhg/exec';

  const FAV_KEY = 'cap_favorites_v3';

  let groups = [];
  let ratings = {};
  let comments = {};
  let favorites = {};
  let insights = {};

  try { favorites = JSON.parse(localStorage.getItem(FAV_KEY)) || {}; } catch { favorites = {}; }

  function generateId() {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 11);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        ...(options.headers || {})
      }
    });

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      throw new Error('Invalid JSON response: ' + text);
    }

    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    return data;
  }

  async function loadDatabase() {
    const enrolledLabel = document.getElementById('enrolledLabel');
    enrolledLabel.textContent = 'Loading database…';

    try {
      const data = await fetchJson(`${API_URL}?t=${Date.now()}`, { method: 'GET' });

      groups = (data.projects || []).map(row => ({
        id: String(row[0] || 'Unknown'),
        groupNum: String(row[0] || 'N/A').replace(/Group\s*/i, ''),
        title: String(row[1] || 'Untitled Project'),
        desc: String(row[2] || 'No description provided.').replace(/\n/g, '<br>'),
        tag: String(row[3] || 'Other'),
        stage: String(row[4] || 'Capstone 1'),
        pin: String(row[5] || ''),
        thumb: ''
      }));

      ratings = {};
      comments = {};
      favorites = {};
      insights = {};

      (data.feedback || []).forEach(row => {
        const gid = String(row[0] || '').trim();
        const name = String(row[2] || '').trim();
        const rating = Number(row[3] || 0);
        const text = String(row[4] || '').trim();
        const dbId = String(row[6] || generateId()).trim();
        const isFav = String(row[7] || '').trim().toUpperCase() === 'TRUE';

        if (!gid) return;

        if (!ratings[gid]) ratings[gid] = {};
        if (rating > 0 && name) ratings[gid][name] = rating;

        if (!comments[gid]) comments[gid] = [];
        comments[gid].push({ id: dbId, name, text, rating });

        if (isFav) {
          if (!favorites[gid]) favorites[gid] = [];
          if (!favorites[gid].includes(dbId)) favorites[gid].push(dbId);
        }
      });

      (data.insights || []).forEach(item => {
        const gid = String(item.groupId || '').trim();
        const text = String(item.text || '').trim();
        const ts = String(item.ts || '').trim();

        if (!gid || !text) return;
        if (!insights[gid]) insights[gid] = [];
        insights[gid].push({ text, ts });
      });

      localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
      renderGrid();
    } catch (err) {
      console.error('DB load error:', err);
      enrolledLabel.textContent = '⚠️ Error connecting to database.';
    }
  }

  loadDatabase();

  let currentRole = null;
  let currentFaculty = null;
  let loggedInStudentId = null;
  let viewingGroupId = null;
  let pendingDel = null;
  let thumbData = null;

  let activeStage = 'all';
  let activeTag = 'all';
  let activeSort = 'default';
  let query = '';
  let currentPage = 1;
  const PAGE_SIZE = 10;

  window.chooseRole = function(role) {
    if (role === 'faculty') {
      closeModal('nameModal');
      showModal('facultyNameModal');
      setTimeout(() => document.getElementById('facultyNameInput').focus(), 300);
    } else {
      showStudentLogin();
    }
  };

  window.showStudentLogin = function() {
    closeModal('nameModal');
    showModal('studentLoginModal');
    document.getElementById('studentLoginErr').style.display = 'none';
    document.getElementById('studentGroupInput').value = '';
    document.getElementById('studentPinInput').value = '';
    setTimeout(() => document.getElementById('studentGroupInput').focus(), 300);
  };

  window.verifyStudentLogin = function() {
    const gNum = document.getElementById('studentGroupInput').value.trim();
    const pin = document.getElementById('studentPinInput').value.trim();
    const err = document.getElementById('studentLoginErr');

    if (!gNum || !pin) {
      err.textContent = '⚠ Please enter both Group Number and PIN.';
      err.style.display = 'block';
      return;
    }

    const group = groups.find(g =>
      g.id.toLowerCase() === gNum.toLowerCase() ||
      g.groupNum.toLowerCase() === gNum.toLowerCase()
    );

    if (!group) {
      err.textContent = '⚠ Group not found.';
      err.style.display = 'block';
      return;
    }

    if (String(group.pin).trim() !== String(pin).trim()) {
      err.textContent = '⚠ Incorrect PIN. Contact your instructor.';
      err.style.display = 'block';
      return;
    }

    err.style.display = 'none';
    currentRole = 'student';
    loggedInStudentId = group.id;
    closeModal('studentLoginModal');
    applyRoleUI();
    renderGrid();
  };

  window.confirmFacultyName = function() {
    const name = document.getElementById('facultyNameInput').value.trim();
    const err = document.getElementById('nameErr');

    if (!name) {
      err.textContent = '⚠ Please enter your name.';
      err.style.display = 'block';
      return;
    }

    err.style.display = 'none';
    currentRole = 'faculty';
    currentFaculty = name;
    closeModal('facultyNameModal');
    applyRoleUI();
    renderGrid();
  };

  window.switchRole = function() {
    currentRole = null;
    currentFaculty = null;
    loggedInStudentId = null;
    document.getElementById('facultyNameInput').value = '';
    showModal('nameModal');
    closeModal('cardModal');
    applyRoleUI();
  };

  function applyRoleUI() {
    const badge = document.getElementById('roleBadge');
    const fc = document.getElementById('facultyControls');
    const rl = document.getElementById('roleLabel');
    const searchBox = document.querySelector('.search-box');
    const tagFilter = document.getElementById('tagFilterWrap');
    const sortWrap = document.getElementById('sortWrap');
    const statsBar = document.querySelector('.stats-bar');
    const filterTabs = document.querySelector('.filter-tabs');

    if (currentRole === 'faculty') {
      badge.textContent = `👩‍🏫 ${currentFaculty} · Switch`;
      badge.className = 'role-badge faculty';
      fc.style.display = 'flex';
      rl.textContent = `Faculty view — logged in as ${currentFaculty}`;
      [searchBox, tagFilter, statsBar, filterTabs].forEach(el => { if (el) el.style.display = ''; });
      if (sortWrap) sortWrap.style.display = 'block';
    } else if (currentRole === 'student') {
      badge.textContent = '🎓 Student View · Switch';
      badge.className = 'role-badge student';
      fc.style.display = 'none';
      rl.textContent = 'Student view — read only';
      [searchBox, tagFilter, statsBar, filterTabs].forEach(el => { if (el) el.style.display = 'none'; });
      if (sortWrap) sortWrap.style.display = 'none';
    } else {
      badge.textContent = '';
      fc.style.display = 'none';
      [searchBox, tagFilter, statsBar, filterTabs].forEach(el => { if (el) el.style.display = ''; });
      if (sortWrap) sortWrap.style.display = 'none';
    }
  }

  const TC = [['#eef2ff','#c7d2fe'],['#d1fae5','#a7f3d0'],['#fef3c7','#fde68a'],
              ['#fee2e2','#fecaca'],['#ede9fe','#ddd6fe'],['#fce7f3','#fbcfe8'],['#dbeafe','#bfdbfe']];
  const TI = ['💡','📊','🖥️','🔬','🌐','📱','🤖','🔧','📡','🛰️','🧬','🗺️'];

  function svgThumb(i) {
    const [c1,c2] = TC[i % TC.length];
    const ic = TI[i % TI.length];
    const uid = 'sv' + i;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 202">
        <defs><linearGradient id="${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${c1}"/><stop offset="100%" style="stop-color:${c2}"/>
        </linearGradient></defs>
        <rect width="360" height="202" fill="url(#${uid})"/>
        <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="48">${ic}</text>
      </svg>`
    );
  }

  function groupAvgRating(gid) {
    const r = ratings[gid];
    if (!r) return 0;
    const vals = Object.values(r).filter(v => v > 0);
    return vals.length ? vals.reduce((a,b) => a + b, 0) / vals.length : 0;
  }

  function groupAllComments(gid) {
    return comments[gid] || [];
  }

  function starsHTML(val, max = 5) {
    return Array.from({ length: max }, (_, i) =>
      `<span class="star-disp${i < Math.round(val) ? ' lit' : ''}">★</span>`
    ).join('');
  }

  document.getElementById('searchInput').addEventListener('input', function() {
    query = this.value.trim().toLowerCase();
    currentPage = 1;
    renderGrid();
  });

  window.setStage = function(stage) {
    activeStage = stage;
    currentPage = 1;
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.stage === stage));
    renderGrid();
  };

  window.toggleTagDropdown = function() {
    document.getElementById('tagFilterBtn').classList.toggle('open');
    document.getElementById('tagDropdown').classList.toggle('open');
    document.getElementById('sortFilterBtn').classList.remove('open');
    document.getElementById('sortDropdown').classList.remove('open');
  };

  function buildTagDropdown() {
    const used = [...new Set(groups.map(g => g.tag).filter(Boolean))].sort();
    const dd = document.getElementById('tagDropdown');
    dd.innerHTML = [
      `<button class="tag-option${activeTag === 'all' ? ' active' : ''}" onclick="setTagFilter('all')">🏷 All Tags</button>`,
      ...used.map(t => `<button class="tag-option${activeTag === t ? ' active' : ''}" onclick="setTagFilter('${t.replace(/'/g, "\\'")}')">${escapeHtml(t)}</button>`)
    ].join('');
    if (!used.length) dd.innerHTML += `<span class="tag-dropdown-empty">No tags yet.</span>`;
  }

  window.setTagFilter = function(tag) {
    activeTag = tag;
    document.getElementById('tagFilterLabel').textContent = tag === 'all' ? '🏷 All Tags' : '🏷 ' + tag;
    document.getElementById('tagFilterBtn').classList.toggle('active-filter', tag !== 'all');
    document.getElementById('tagFilterBtn').classList.remove('open');
    document.getElementById('tagDropdown').classList.remove('open');
    currentPage = 1;
    renderGrid();
  };

  window.toggleSortDropdown = function() {
    document.getElementById('sortFilterBtn').classList.toggle('open');
    document.getElementById('sortDropdown').classList.toggle('open');
    document.getElementById('tagFilterBtn').classList.remove('open');
    document.getElementById('tagDropdown').classList.remove('open');
  };

  const SORT_LABELS = {
    default: '↕ Sort: Default',
    highest: 'Top Rated',
    lowest: 'Lowest Rated',
    highest_mine: 'My Highest',
    needs_rating: 'Pending Review'
  };

  window.setSort = function(sortType) {
    activeSort = sortType;
    document.getElementById('sortFilterLabel').textContent = SORT_LABELS[sortType] || '↕ Sort: Default';
    document.getElementById('sortFilterBtn').classList.toggle('active-filter', sortType !== 'default');
    document.querySelectorAll('#sortDropdown .tag-option').forEach(o => {
      o.classList.toggle('active', o.dataset.sort === sortType);
    });
    document.getElementById('sortFilterBtn').classList.remove('open');
    document.getElementById('sortDropdown').classList.remove('open');
    currentPage = 1;
    renderGrid();
  };

  document.addEventListener('click', e => {
    const tagWrap = document.getElementById('tagFilterWrap');
    const sortWrap = document.getElementById('sortWrap');
    if (tagWrap && !tagWrap.contains(e.target)) {
      document.getElementById('tagFilterBtn').classList.remove('open');
      document.getElementById('tagDropdown').classList.remove('open');
    }
    if (sortWrap && !sortWrap.contains(e.target)) {
      document.getElementById('sortFilterBtn').classList.remove('open');
      document.getElementById('sortDropdown').classList.remove('open');
    }
  });

  function updateStats() {
    const total = groups.length;
    const rated = groups.filter(g => groupAvgRating(g.id) > 0).length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statRated').textContent = rated;
    document.getElementById('statUnrated').textContent = total - rated;
    document.getElementById('enrolledLabel').textContent =
      `AY 2026–2027 · ${total} group${total !== 1 ? 's' : ''} enrolled`;
  }

  function renderGrid() {
    updateStats();
    buildTagDropdown();
    const grid = document.getElementById('cardGrid');
    let list = groups;

    if (currentRole === 'student') {
      list = list.filter(g => g.id === loggedInStudentId);
      document.getElementById('sectionLabel').textContent = 'My Project Proposal';
      grid.style.cssText = 'display:flex;justify-content:center;align-items:flex-start;padding-top:40px;min-height:300px;';
    } else {
      if (activeStage !== 'all') list = list.filter(g => g.stage === activeStage);
      if (activeTag !== 'all') list = list.filter(g => g.tag === activeTag);
      if (query) list = list.filter(g =>
        g.title.toLowerCase().includes(query) || g.groupNum.toLowerCase().includes(query)
      );

      const stagePart = activeStage === 'all' ? 'All Projects' : activeStage;
      const tagPart = activeTag !== 'all' ? ` — ${activeTag}` : '';
      document.getElementById('sectionLabel').textContent = query ? `Results for "${query}"` : stagePart + tagPart;

      function myRating(gid) { return (ratings[gid] || {})[currentFaculty] || 0; }
      if (activeSort === 'highest') list.sort((a,b) => groupAvgRating(b.id) - groupAvgRating(a.id));
      else if (activeSort === 'lowest') list.sort((a,b) => groupAvgRating(a.id) - groupAvgRating(b.id));
      else if (activeSort === 'highest_mine') list.sort((a,b) => myRating(b.id) - myRating(a.id));
      else if (activeSort === 'needs_rating') {
        list.sort((a,b) => {
          const ra = myRating(a.id), rb = myRating(b.id);
          return (ra === 0 && rb > 0) ? -1 : (rb === 0 && ra > 0) ? 1 : 0;
        });
      }
      grid.style.cssText = '';
    }

    if (!list.length) {
      grid.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>${groups.length ? 'No results found' : 'No groups yet'}</h3>
        <p>${groups.length ? 'Try a different search or filter.' : 'Click "+ Add Group" to start.'}</p>
      </div>`;
      document.getElementById('pagination').style.display = 'none';
      return;
    }

    const totalPages = Math.ceil(list.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageList = list.slice(start, start + PAGE_SIZE);

    grid.innerHTML = pageList.map((g,i) => cardHTML(g, start + i)).join('');
    pageList.forEach(g => {
      const el = document.getElementById('card-' + g.id);
      if (el) el.addEventListener('click', () => openCardModal(g.id));
    });

    if (currentRole === 'student') {
      document.getElementById('pagination').style.display = 'none';
    } else {
      renderPagination(list.length, totalPages);
    }
  }

  function cardHTML(g, i) {
    const thumb = g.thumb || svgThumb(i);
    const avg = groupAvgRating(g.id);
    const delay = Math.min(i * 0.05, 0.5);
    const commentCount = groupAllComments(g.id).length;
    let reviewedBadge = '';

    if (currentRole === 'faculty' && currentFaculty) {
      const mr = (ratings[g.id] || {})[currentFaculty] || 0;
      if (mr > 0) reviewedBadge = `<span class="card-reviewed-badge-footer">✓ REVIEWED</span>`;
    }

    return `
      <div class="card" id="card-${escapeHtml(g.id)}" style="animation-delay:${delay}s">
        <div class="card-thumb">
          <img src="${thumb}" alt="${escapeHtml(g.title)}" onerror="this.src='${svgThumb(i)}'"/>
          <div class="thumb-badge">${escapeHtml(g.tag || '—')}</div>
        </div>
        <div class="card-body">
          <div class="card-group-num">Group ${escapeHtml(g.groupNum)}</div>
          <div class="card-title">${escapeHtml(g.title)}</div>
          <div class="card-desc">${g.desc}</div>
        </div>
        <div class="card-footer">
          <div class="card-footer-stars">${starsHTML(avg)}</div>
          <div class="card-footer-meta">
            ${reviewedBadge}
            ${avg > 0 ? `<span class="card-avg">${avg.toFixed(1)}</span>` : '<span class="card-unrated">Unrated</span>'}
            ${commentCount > 0 ? `<span class="card-comment-count">💬 ${commentCount}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderPagination(total, totalPages) {
    const bar = document.getElementById('pagination');
    if (totalPages <= 1) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';
    const s = (currentPage - 1) * PAGE_SIZE + 1;
    const e = Math.min(currentPage * PAGE_SIZE, total);
    document.getElementById('paginationInfo').textContent = `Showing ${s}–${e} of ${total} groups`;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages;

    const range = [];
    const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) range.push(i);
    }

    const withEll = [];
    let prev = null;
    for (const p of range) {
      if (prev !== null && p - prev > 1) withEll.push('…');
      withEll.push(p);
      prev = p;
    }

    document.getElementById('pageNumbers').innerHTML = withEll.map(p =>
      p === '…'
        ? `<span class="page-ellipsis">…</span>`
        : `<button class="page-num${p === currentPage ? ' active' : ''}" onclick="goToPage(${p})">${p}</button>`
    ).join('');
  }

  window.changePage = function(dir) {
    let list = groups;
    if (activeStage !== 'all') list = list.filter(g => g.stage === activeStage);
    if (activeTag !== 'all') list = list.filter(g => g.tag === activeTag);
    if (query) list = list.filter(g => g.title.toLowerCase().includes(query) || g.groupNum.toLowerCase().includes(query));
    const tp = Math.ceil(list.length / PAGE_SIZE);
    currentPage = Math.max(1, Math.min(currentPage + dir, tp));
    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.goToPage = function(p) {
    currentPage = p;
    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function openCardModal(gid) {
    const g = groups.find(x => x.id === gid);
    if (!g) return;

    viewingGroupId = gid;
    const i = groups.indexOf(g);
    const avg = groupAvgRating(gid);

    document.getElementById('cmTitle').textContent = g.title;
    document.getElementById('cmGroupNum').textContent = `Group ${g.groupNum}`;
    document.getElementById('cmStage').textContent = g.stage || '—';
    document.getElementById('cmTag').textContent = g.tag || '—';
    document.getElementById('cmDesc').innerHTML = g.desc;
    document.getElementById('cmThumb').src = g.thumb || svgThumb(i);
    document.getElementById('cmStarsDisplay').innerHTML = starsHTML(avg, 5);
    document.getElementById('cmAvgNum').textContent = avg > 0 ? `${avg.toFixed(1)} / 5` : 'No ratings yet';

    const isFac = currentRole === 'faculty';
    document.getElementById('facultySection').style.display = isFac ? 'block' : 'none';
    document.getElementById('studentSection').style.display = currentRole === 'student' ? 'block' : 'none';
    document.getElementById('cmDeleteRow').style.display = isFac ? 'block' : 'none';

    if (isFac) renderFacultySection(gid);
    if (currentRole === 'student') renderStudentSection(gid);

    showModal('cardModal');
  }

  function renderFacultySection(gid) {
    const myRating = (ratings[gid] || {})[currentFaculty] || 0;
    const alreadyRated = myRating > 0;
    const stars = [...document.querySelectorAll('#cmStarRow .star')];
    const labelEl = document.getElementById('facultySectionLabel');

    stars.forEach(s => {
      s.classList.toggle('active', +s.dataset.val <= myRating);
      if (!alreadyRated) {
        s.style.cursor = 'pointer';
        s.onclick = e => {
          e.stopPropagation();
          const v = +s.dataset.val;
          if (!ratings[gid]) ratings[gid] = {};
          ratings[gid][currentFaculty] = v;
          stars.forEach(x => x.classList.toggle('active', +x.dataset.val <= v));
          const avg = groupAvgRating(gid);
          document.getElementById('cmStarsDisplay').innerHTML = starsHTML(avg, 5);
          document.getElementById('cmAvgNum').textContent = avg > 0 ? `${avg.toFixed(1)} / 5` : 'No ratings yet';
          updateStats();
        };
      } else {
        s.style.cursor = 'default';
        s.onclick = null;
      }
    });

    labelEl.innerHTML = alreadyRated
      ? `✏️ Your Rating <span style="color:var(--subtext);font-weight:normal;">(Locked)</span> &amp; New Comment`
      : `✏️ Your Rating &amp; Comment`;

    document.getElementById('cmComment').value = '';
    document.getElementById('cmSavedMsg').classList.remove('show');
  }

  window.saveFacultyFeedback = async function() {
    const gid = viewingGroupId;
    const g = groups.find(x => x.id === gid);
    const text = document.getElementById('cmComment').value.trim();
    const myRating = (ratings[gid] || {})[currentFaculty] || 0;
    const m = document.getElementById('cmSavedMsg');

    if (!text && myRating === 0) {
      alert('Please provide a rating or a comment.');
      return;
    }

    const commentId = generateId();
    m.textContent = 'Saving…';
    m.style.color = 'var(--subtext)';
    m.classList.add('show');

    try {
      const result = await fetchJson(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'saveFeedback',
          groupId: gid,
          title: g ? g.title : '',
          facultyName: currentFaculty,
          rating: myRating,
          comment: text,
          commentId
        })
      });

      if (result.status !== 'success') throw new Error(result.message || 'Save failed');

      if (!comments[gid]) comments[gid] = [];
      comments[gid].push({ id: commentId, name: currentFaculty, text, rating: myRating });
      m.textContent = '✓ Comment Added';
      m.style.color = '#10b981';
      document.getElementById('cmComment').value = '';
      updateStats();
      setTimeout(() => m.classList.remove('show'), 2000);
    } catch (err) {
      m.textContent = '⚠️ Save failed';
      m.style.color = '#ef4444';
    }
  };

  function renderStudentSection(gid) {
    const allComments = groupAllComments(gid);
    const favIds = favorites[gid] || [];
    const listEl = document.getElementById('cmCommentsList');
    const noEl = document.getElementById('cmNoComments');
    const favNote = document.getElementById('cmFavNote');

    if (!allComments.length) {
      listEl.innerHTML = '';
      noEl.style.display = 'block';
    } else {
      noEl.style.display = 'none';
      listEl.innerHTML = allComments.map((c, idx) => {
        const fav = favIds.includes(c.id);
        return `
          <div class="comment-card${fav ? ' fav-active' : ''}" id="ccard-${escapeHtml(c.id)}">
            <div class="comment-card-top">
              <div class="comment-anon-label">Anonymous Faculty ${idx + 1}</div>
              <div class="comment-card-stars">${starsHTML(c.rating)}</div>
            </div>
            <div class="comment-text">${c.text ? escapeHtml(c.text) : '<em style="color:var(--subtext)">No comment written.</em>'}</div>
            <div class="comment-card-actions">
              <button class="heart-fav-btn${fav ? ' hearted' : ''}" onclick="toggleFav('${String(gid).replace(/'/g, "\\'")}','${String(c.id).replace(/'/g, "\\'")}')" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">
                ${fav ? '❤️' : '🤍'}
                <span>${fav ? 'Favorited' : 'Favorite'}</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    const favCount = favIds.length;
    if (favCount > 0) {
      const names = favIds.map(id => {
        const idx = allComments.findIndex(c => c.id === id);
        return idx >= 0 ? `Anonymous Faculty ${idx + 1}` : null;
      }).filter(Boolean);
      favNote.innerHTML = `<div class="fav-selected-note">❤️ You've favorited <strong>${favCount}</strong> comment${favCount > 1 ? 's' : ''}: ${names.join(', ')}.</div>`;
    } else {
      favNote.innerHTML = `<span style="font-size:13px;color:var(--subtext);">No favorites yet. Tap ❤️ on any comment to mark it.</span>`;
    }

    renderStudentInsights(gid);
  }

  function renderStudentInsights(gid) {
    const list = insights[gid] || [];
    const el = document.getElementById('studentInsightsList');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = '';
      return;
    }

    const sorted = [...list].reverse();
    el.innerHTML = sorted.map((entry, i) => `
      <div class="insight-card">
        <div class="insight-card-top">
          <span class="insight-label">My Insight #${i + 1}</span>
          <span style="font-size:11px;color:var(--subtext);">${escapeHtml(entry.ts || '')}</span>
        </div>
        <div class="comment-text">${escapeHtml(entry.text)}</div>
      </div>
    `).join('');
  }

  window.saveStudentInsight = async function() {
    const gid = viewingGroupId;
    const input = document.getElementById('studentInsightInput');
    const text = input.value.trim();
    const msg = document.getElementById('insightSavedMsg');

    if (!text) return;

    msg.textContent = 'Saving…';
    msg.style.color = 'var(--subtext)';
    msg.classList.add('show');

    try {
      const result = await fetchJson(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'saveStudentInsight',
          groupId: gid,
          insightText: text
        })
      });

      if (result.status !== 'success') {
        throw new Error(result.message || 'Failed to save');
      }

      if (!insights[gid]) insights[gid] = [];
      insights[gid].push({
        text: text,
        ts: result.ts || new Date().toLocaleString()
      });

      input.value = '';
      renderStudentInsights(gid);

      msg.textContent = '✓ Posted';
      msg.style.color = '#10b981';
      setTimeout(() => msg.classList.remove('show'), 2000);
    } catch (e) {
      console.warn('Insight sync failed', e);
      msg.textContent = '⚠️ Failed to save';
      msg.style.color = '#ef4444';
      setTimeout(() => msg.classList.remove('show'), 2000);
    }
  };

  window.toggleFav = async function(gid, commentId) {
    if (!favorites[gid]) favorites[gid] = [];

    const alreadyFav = favorites[gid].includes(commentId);
    const newFavoriteState = !alreadyFav;

    if (alreadyFav) {
      favorites[gid] = favorites[gid].filter(id => id !== commentId);
    } else {
      favorites[gid].push(commentId);
    }

    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
    renderStudentSection(gid);

    try {
      const result = await fetchJson(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'toggleFavorite',
          groupId: gid,
          commentId: commentId,
          isFavorite: newFavoriteState
        })
      });

      if (result.status !== 'success') throw new Error(result.message || 'Favorite save failed');
    } catch (e) {
      console.warn('Fav sync failed', e);
    }
  };

  window.askDeleteFromModal = function() {
    pendingDel = viewingGroupId;
    openModal('delModal');
  };

  window.confirmDelete = async function() {
    if (!pendingDel) return;
    const btn = document.querySelector('.btn-conf-delete');
    btn.textContent = 'Deleting…';
    btn.disabled = true;

    try {
      await fetchJson(API_URL, {
        method:'POST',
        body: JSON.stringify({ action:'deleteGroup', groupId: pendingDel })
      });
    } catch(e) {
      console.warn('Delete sync failed', e);
    }

    groups = groups.filter(g => g.id !== pendingDel);
    delete ratings[pendingDel];
    delete comments[pendingDel];
    delete favorites[pendingDel];
    delete insights[pendingDel];
    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));

    pendingDel = null;
    currentPage = 1;
    closeModal('delModal');
    closeModal('cardModal');
    renderGrid();

    btn.textContent = 'Yes, Delete';
    btn.disabled = false;
  };

  window.openAddModal = function() {
    if (currentRole !== 'faculty') return;
    ['fGroupNum','fTitle','fDesc','fPin'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fTag').value = '';
    document.getElementById('fStage').value = '';
    document.getElementById('fCustomTag').value = '';
    document.getElementById('customTagWrap').style.display = 'none';
    document.getElementById('formErr').style.display = 'none';
    clearThumb();
    openModal('addModal');
  };

  window.handleTagChange = function() {
    const val = document.getElementById('fTag').value;
    const wrap = document.getElementById('customTagWrap');
    if (val === 'Other') {
      wrap.style.display = 'block';
      document.getElementById('fCustomTag').focus();
    } else {
      wrap.style.display = 'none';
      document.getElementById('fCustomTag').value = '';
    }
  };

  window.onThumbPick = function(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      thumbData = ev.target.result;
      const p = document.getElementById('thumbPreview');
      p.src = thumbData;
      p.classList.add('show');
      document.getElementById('removeThumbBtn').style.display = 'block';
    };
    r.readAsDataURL(f);
  };

  window.clearThumb = function() {
    thumbData = null;
    const p = document.getElementById('thumbPreview');
    p.src = '';
    p.classList.remove('show');
    document.getElementById('removeThumbBtn').style.display = 'none';
    document.getElementById('thumbFile').value = '';
  };

  window.submitGroup = async function() {
    const gn = document.getElementById('fGroupNum').value.trim();
    const ti = document.getElementById('fTitle').value.trim();
    const de = document.getElementById('fDesc').value.trim();
    const tgRaw = document.getElementById('fTag').value;
    const st = document.getElementById('fStage').value;
    const pin = document.getElementById('fPin').value.trim();
    const custom = document.getElementById('fCustomTag').value.trim();
    const tg = tgRaw === 'Other' ? custom : tgRaw;
    const er = document.getElementById('formErr');
    const btn = document.querySelector('#addModal .btn-submit');

    if (!gn || !ti || !de || !tgRaw || !st || !pin) {
      er.textContent = '⚠ Please fill in all required fields, including the PIN.';
      er.style.display = 'block';
      return;
    }

    if (tgRaw === 'Other' && !custom) {
      er.textContent = '⚠ Please enter a custom tag name.';
      er.style.display = 'block';
      document.getElementById('fCustomTag').focus();
      return;
    }

    er.style.display = 'none';
    btn.textContent = 'Saving…';
    btn.disabled = true;

    const newGroup = { id: gn, groupNum: gn, title: ti, desc: de, tag: tg, stage: st, pin, thumb: thumbData || '' };

    try {
      const result = await fetchJson(API_URL, {
        method:'POST',
        body: JSON.stringify({ action:'addGroup', ...newGroup })
      });

      if (result.status !== 'success') throw new Error(result.message || 'Failed to save');

      groups.push(newGroup);
      currentPage = 1;
      closeModal('addModal');
      renderGrid();
    } catch(e) {
      er.textContent = '⚠️ Failed to save to database.';
      er.style.display = 'block';
    } finally {
      btn.textContent = 'Add Group';
      btn.disabled = false;
    }
  };

  window.openModal = id => document.getElementById(id).classList.add('open');
  window.closeModal = id => document.getElementById(id).classList.remove('open');
  window.showModal = id => document.getElementById(id).classList.add('open');
  window.overlayClick = (e,id) => { if (e.target.id === id) closeModal(id); };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['addModal','delModal','cardModal','facultyNameModal','studentLoginModal'].forEach(closeModal);
    }
  });
});