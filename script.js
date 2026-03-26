document.addEventListener("DOMContentLoaded", () => {

  // ══════════════════════════════════════════════
  // GOOGLE SHEETS API CONNECTION
  // ══════════════════════════════════════════════
  const API_URL = 'https://script.google.com/macros/s/AKfycbz7pDAcJggFU5jjNZ3YYMbZoHD1Fv_s-qZdVkm8JJbikNju-gR1YWyC695KwyKKBnihgA/exec'; 

  const FAV = 'cap_favorites_v1'; 
  let groups = [];
  let ratings = {};
  let comments = {};
  let favorites = {}; 

  try { favorites = JSON.parse(localStorage.getItem(FAV)) || {}; } catch { favorites = {}; }

  // Fetch data from Google Sheets on load
// Fetch data from Google Sheets on load
  async function loadDatabase() {
    const enrolledLabel = document.getElementById('enrolledLabel');
    enrolledLabel.textContent = "Loading database from Google Sheets...";
    
    try {
      const response = await fetch(API_URL);
      const data = await response.json();
      
      // FIX: Use row[index] to get specific columns
      // row[0]=ID/GroupNum, row[1]=Title, row[2]=Desc, row[3]=Tag, row[4]=Stage, row[5]=PIN
      groups = data.projects.map(row => ({
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
      
      // FIX: Map feedback columns correctly
      // row[0]=GID, row[1]=Title, row[2]=Faculty, row[3]=Rating, row[4]=Comment
      data.feedback.forEach(row => {
        const gid = String(row[0]);
        const facName = String(row[2]); // Faculty is now in Column C (index 2)
        const rating = Number(row[3]);  // Rating is now in Column D (index 3)
        const comment = String(row[4]); // Comment is now in Column E (index 4)

        if (!ratings[gid]) ratings[gid] = {};
        if (!ratings[gid][facName] || ratings[gid][facName] === 0) {
            ratings[gid][facName] = rating;
        }

        if (!comments[gid]) comments[gid] = [];
        comments[gid].push({
            name: facName,
            text: comment,
            rating: rating
        });
      });

      renderGrid();
    } catch (error) {
      console.error("Error loading database:", error);
      enrolledLabel.textContent = "⚠️ Error connecting to database.";
    }
  }
  // Load data immediately
  loadDatabase();

  // ══════════════════════════════════════════════
  // ROLE STATE & UI
  // ══════════════════════════════════════════════
  let currentRole       = null;   
  let currentFaculty    = null;   
  let viewingGroupId    = null;   
  let pendingDel        = null;
  let thumbData         = null;

  let activeStage = 'all';
  let activeTag   = 'all';
  let query       = '';
  let currentPage = 1;
  const PAGE_SIZE = 10;

 window.chooseRole = function(role) {
  if (role === 'faculty') {
    closeModal('nameModal');
    showModal('facultyNameModal');
    setTimeout(() => document.getElementById('facultyNameInput').focus(), 300);
  } else {
    // ADD THIS:
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

      // Find the group (case insensitive)
      const group = groups.find(g => 
        g.id.toLowerCase() === gNum.toLowerCase() || 
        g.groupNum.toLowerCase() === gNum.toLowerCase()
      );

      
      if (!group) {
          err.textContent = '⚠ Group not found. Check the group number.';
          err.style.display = 'block';
          return;
      }
      console.log("Checking:", gNum, pin, "Against:", group.pin);

      // FIX: Force both to strings and trim them for a fair comparison
      const storedPin = String(group.pin || '').trim();
      const enteredPin = String(pin).trim();

      if (storedPin !== enteredPin) {
          err.textContent = '⚠ Incorrect PIN. Please contact your instructor.';
          err.style.display = 'block';
          return;
      }

      // Success!
      err.style.display = 'none';
      currentRole = 'student';
      loggedInStudentId = group.id; // Store this for filtering
      closeModal('studentLoginModal');
      
      applyRoleUI(); 
      openCardModal(group.id); // Open their specific data immediately
      renderGrid(); // Refresh grid to only show their card
  };

  window.confirmFacultyName = function() {
    const name = document.getElementById('facultyNameInput').value.trim();
    const err  = document.getElementById('nameErr');
    if (!name) {
      err.textContent = '⚠ Please enter your name.';
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';
    currentRole    = 'faculty';
    currentFaculty = name;
    closeModal('facultyNameModal');
    applyRoleUI();
    renderGrid();
  };

  window.switchRole = function() {
    currentRole    = null;
    currentFaculty = null;
    document.getElementById('facultyNameInput').value = '';
    showModal('nameModal');
    
    // Close card modal if a student was viewing their card and logged out
    closeModal('cardModal');
    applyRoleUI();
  };

  function applyRoleUI() {
    const badge = document.getElementById('roleBadge');
    const fc    = document.getElementById('facultyControls');
    const rl    = document.getElementById('roleLabel');
    
    // Target specific elements
    const searchBox = document.querySelector('.search-box');
    const tagFilter = document.getElementById('tagFilterWrap');
    const statsBar  = document.querySelector('.stats-bar');
    const filterTabs = document.querySelector('.filter-tabs');
    const gridSection = document.querySelector('.grid-section');

    if (currentRole === 'faculty') {
      badge.textContent = `👩‍🏫 ${currentFaculty} · Switch`;
      badge.className   = 'role-badge faculty';
      fc.style.display  = 'flex';
      rl.textContent    = `Faculty view — logged in as ${currentFaculty}`;
      
      if (searchBox) searchBox.style.display = '';
      if (tagFilter) tagFilter.style.display = '';
      if (statsBar) statsBar.style.display = '';
      if (filterTabs) filterTabs.style.display = '';
      if (gridSection) gridSection.style.display = ''; 
      
    } else if (currentRole === 'student') {
      badge.textContent = '🎓 Student View · Switch';
      badge.className   = 'role-badge student';
      fc.style.display  = 'none';
      rl.textContent    = 'Student view — read only';
      
      // Hide search, filters, stats, and tabs for students
      if (searchBox) searchBox.style.display = 'none';
      if (tagFilter) tagFilter.style.display = 'none';
      if (statsBar) statsBar.style.display = 'none';
      if (filterTabs) filterTabs.style.display = 'none';
      
      // Keep the grid section visible so they can see their card!
      if (gridSection) gridSection.style.display = '';

    } else {
      badge.textContent = '';
      fc.style.display  = 'none';
      
      if (searchBox) searchBox.style.display = '';
      if (tagFilter) tagFilter.style.display = '';
      if (statsBar) statsBar.style.display = '';
      if (filterTabs) filterTabs.style.display = '';
      if (gridSection) gridSection.style.display = '';
    }
  }

  // ══════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════
  const TC = [['#eef2ff','#c7d2fe'],['#d1fae5','#a7f3d0'],['#fef3c7','#fde68a'],
              ['#fee2e2','#fecaca'],['#ede9fe','#ddd6fe'],['#fce7f3','#fbcfe8'],['#dbeafe','#bfdbfe']];
  const TI = ['💡','📊','🖥️','🔬','🌐','📱','🤖','🔧','📡','🛰️','🧬','🗺️'];

  function svgThumb(i) {
    const [c1, c2] = TC[i % TC.length], ic = TI[i % TI.length], uid = 'sv' + i;
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

  function groupAvgRating(gid) {
    const r = ratings[gid];
    if (!r) return 0;
    const vals = Object.values(r).filter(v => v > 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function groupAllComments(gid) {
    return comments[gid] || []; 
  }

  function starsHTML(val, max = 5) {
    let h = '';
    for (let i = 1; i <= max; i++) {
      h += `<span class="star-disp${i <= Math.round(val) ? ' lit' : ''}">★</span>`;
    }
    return h;
  }

  // ══════════════════════════════════════════════
  // FILTERING & UI UPDATES
  // ══════════════════════════════════════════════
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
  };

  function buildTagDropdown() {
    const used = [...new Set(groups.map(g => g.tag).filter(Boolean))].sort();
    const dd   = document.getElementById('tagDropdown');
    dd.innerHTML = [
      `<button class="tag-option${activeTag === 'all' ? ' active' : ''}" onclick="setTagFilter('all')">🏷 All Tags</button>`,
      ...used.map(t => `<button class="tag-option${activeTag === t ? ' active' : ''}" onclick="setTagFilter('${t.replace(/'/g,"\\'")}') ">${t}</button>`)
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

  function updateStats() {
    const total = groups.length;
    const rated = groups.filter(g => groupAvgRating(g.id) > 0).length;
    document.getElementById('statTotal').textContent   = total;
    document.getElementById('statRated').textContent   = rated;
    document.getElementById('statUnrated').textContent = total - rated;
    document.getElementById('enrolledLabel').textContent =
      `AY 2026–2027 · ${total} group${total !== 1 ? 's' : ''} enrolled`;
  }

  function renderGrid() {
    updateStats();
    buildTagDropdown();

    let list = groups;
    const grid = document.getElementById('cardGrid');

    // STRICT FILTER FOR STUDENTS & CENTERING LOGIC
    if (currentRole === 'student') {
        list = list.filter(g => g.id === loggedInStudentId);
        document.getElementById('sectionLabel').textContent = "My Project Proposal";
        
        // Center the single card using Flexbox
        grid.style.display = 'flex';
        grid.style.justifyContent = 'center';
        grid.style.paddingTop = '40px'; // Breathing room from the section label
    } else {
        // Normal filters for faculty
        if (activeStage !== 'all') list = list.filter(g => g.stage === activeStage);
        if (activeTag   !== 'all') list = list.filter(g => g.tag   === activeTag);
        if (query) list = list.filter(g =>
          g.title.toLowerCase().includes(query) || g.groupNum.toLowerCase().includes(query));
          
        const stagePart = activeStage === 'all' ? 'All Projects' : activeStage;
        const tagPart   = activeTag   !== 'all' ? ` — ${activeTag}` : '';
        document.getElementById('sectionLabel').textContent = query ? `Results for "${query}"` : stagePart + tagPart;
        
        // Reset grid styles for faculty multi-card view
        grid.style.display = '';
        grid.style.justifyContent = '';
        grid.style.paddingTop = '';
    }

    if (!list.length) {
      grid.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>${groups.length ? 'No results found' : 'No groups yet'}</h3>
        <p>${groups.length ? 'Try a different search or filter.' : 'Click "+ Add Group" or "Import" to start.'}</p>
      </div>`;
      document.getElementById('pagination').style.display = 'none';
      return;
    }

    const totalPages = Math.ceil(list.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start    = (currentPage - 1) * PAGE_SIZE;
    const pageList = list.slice(start, start + PAGE_SIZE);

    grid.innerHTML = pageList.map((g, i) => cardHTML(g, start + i)).join('');

    pageList.forEach(g => {
      const el = document.querySelector(`[id="card-${g.id}"]`);
      if (el) el.addEventListener('click', () => openCardModal(g.id));
    });

    // Hide pagination for students since they only have one card
    if (currentRole === 'student') {
        document.getElementById('pagination').style.display = 'none';
    } else {
        renderPagination(list.length, totalPages);
    }
  }

  function cardHTML(g, i) {
    const thumb = g.thumb || svgThumb(i);
    const avg   = groupAvgRating(g.id);
    const delay = Math.min(i * 0.05, 0.5);
    const commentCount = groupAllComments(g.id).length;
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
      <div class="card-footer">
        <div class="card-footer-stars">${starsHTML(avg)}</div>
        <div class="card-footer-meta">
          ${avg > 0 ? `<span class="card-avg">${avg.toFixed(1)}</span>` : '<span class="card-unrated">Unrated</span>'}
          ${commentCount > 0 ? `<span class="card-comment-count">💬 ${commentCount}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  function renderPagination(total, totalPages) {
    const bar = document.getElementById('pagination');
    if (totalPages <= 1) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end   = Math.min(currentPage * PAGE_SIZE, total);
    document.getElementById('paginationInfo').textContent = `Showing ${start}–${end} of ${total} groups`;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages;
    const range = [], delta = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) range.push(i);
    }
    const withEll = []; let prev = null;
    for (const p of range) {
      if (prev !== null && p - prev > 1) withEll.push('…');
      withEll.push(p); prev = p;
    }
    document.getElementById('pageNumbers').innerHTML = withEll.map(p =>
      p === '…' ? `<span class="page-ellipsis">…</span>`
                : `<button class="page-num${p === currentPage ? ' active' : ''}" onclick="goToPage(${p})">${p}</button>`
    ).join('');
  }

  window.changePage = function(dir) {
    let list = groups;
    if (activeStage !== 'all') list = list.filter(g => g.stage === activeStage);
    if (activeTag   !== 'all') list = list.filter(g => g.tag   === activeTag);
    if (query) list = list.filter(g => g.title.toLowerCase().includes(query) || g.groupNum.toLowerCase().includes(query));
    const totalPages = Math.ceil(list.length / PAGE_SIZE);
    currentPage = Math.max(1, Math.min(currentPage + dir, totalPages));
    renderGrid(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.goToPage = function(p) { currentPage = p; renderGrid(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // ══════════════════════════════════════════════
  // CARD MODAL & SAVING FEEDBACK
  // ══════════════════════════════════════════════
  function openCardModal(gid) {
    const g = groups.find(x => x.id === gid);
    if (!g) return;
    viewingGroupId = gid;

    const i     = groups.indexOf(g);
    const thumb = g.thumb || svgThumb(i);
    const avg   = groupAvgRating(gid);

    document.getElementById('cmTitle').textContent    = g.title;
    document.getElementById('cmGroupNum').textContent = `Group ${g.groupNum}`;
    document.getElementById('cmStage').textContent    = g.stage || '—';
    document.getElementById('cmTag').textContent      = g.tag   || '—';
    document.getElementById('cmDesc').innerHTML = g.desc;
    document.getElementById('cmThumb').src            = thumb;

    document.getElementById('cmStarsDisplay').innerHTML = starsHTML(avg, 5);
    document.getElementById('cmAvgNum').textContent =
      avg > 0 ? `${avg.toFixed(1)} / 5` : 'No ratings yet';

    const isFaculty = currentRole === 'faculty';
    document.getElementById('facultySection').style.display = isFaculty ? 'block' : 'none';
    document.getElementById('studentSection').style.display = currentRole === 'student' ? 'block' : 'none';
    document.getElementById('cmDeleteRow').style.display    = isFaculty ? 'block' : 'none';

    if (isFaculty) renderFacultySection(gid);
    if (currentRole === 'student') renderStudentSection(gid);

    showModal('cardModal');
  }

 function renderFacultySection(gid) {
    const myRating = (ratings[gid] || {})[currentFaculty] || 0;
    const hasAlreadyRated = myRating > 0;

    const stars = [...document.querySelectorAll('#cmStarRow .star')];
    
    // Highlight stars based on existing rating
    stars.forEach(s => {
      s.classList.toggle('active', +s.dataset.val <= myRating);
      
      // Only allow clicking if they haven't rated yet
      if (!hasAlreadyRated) {
        s.style.cursor = "pointer";
        s.onclick = e => {
          e.stopPropagation();
          const v = +s.dataset.val;
          if (!ratings[gid]) ratings[gid] = {};
          ratings[gid][currentFaculty] = v;
          
          stars.forEach(x => x.classList.toggle('active', +x.dataset.val <= v));
        };
      } else {
        s.style.cursor = "default";
        s.onclick = null; // Disable clicking
      }
    });

    // We do NOT load the old comment into the box anymore because we want it empty for new ones
    document.getElementById('cmComment').value = ''; 
    document.getElementById('cmSavedMsg').classList.remove('show');
    
    // Add a small hint if they already rated
    if (hasAlreadyRated) {
        document.querySelector('.cm-section-label').innerHTML = `✏️ Your Rating <span style="color:var(--subtext); font-weight:normal;">(Locked)</span> &amp; New Comment`;
    }
  }

window.saveFacultyFeedback = async function() {
    const gid = viewingGroupId;
    const g = groups.find(x => x.id === gid);
    const projectTitle = g ? g.title : "Unknown Title";

    const commentInput = document.getElementById('cmComment');
    const text = commentInput.value.trim();
    const myRating = (ratings[gid] || {})[currentFaculty] || 0;
    const m = document.getElementById('cmSavedMsg');

    if (!text && myRating === 0) {
        alert("Please provide a rating or a comment.");
        return;
    }

    m.textContent = "Saving...";
    m.style.color = "var(--subtext)";
    m.classList.add('show');

    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'saveFeedback',
          groupId: gid,
          title: projectTitle, 
          facultyName: currentFaculty,
          rating: myRating,
          comment: text
        })
      });

      // Update local UI state
      if (!comments[gid]) comments[gid] = [];
      comments[gid].push({ name: currentFaculty, text: text, rating: myRating });

      m.textContent = "✓ Comment Added";
      m.style.color = "#10b981";
      
      // CLEAR THE COMMENT BOX for the next one
      commentInput.value = '';

      updateStats();
      setTimeout(() => m.classList.remove('show'), 2000);

    } catch (err) {
      m.textContent = "⚠️ Save failed";
      m.style.color = "#ef4444";
    }
  };

  function renderStudentSection(gid) {
    const allComments = groupAllComments(gid);
    const favName     = favorites[gid] || null;
    const listEl      = document.getElementById('cmCommentsList');
    const noEl        = document.getElementById('cmNoComments');
    const favNote     = document.getElementById('cmFavNote');

    if (!allComments.length) {
      listEl.innerHTML = '';
      noEl.style.display = 'block';
    } else {
      noEl.style.display = 'none';
      listEl.innerHTML = allComments.map((c, idx) => {
        const isFav = favName === c.name;
        return `
        <div class="comment-card${isFav ? ' fav-active' : ''}" id="ccard-${idx}">
          <div class="comment-card-top">
            <div class="comment-anon-label">Anonymous Faculty ${idx + 1}</div>
            <div class="comment-card-stars">${starsHTML(c.rating)}</div>
          </div>
          <div class="comment-text">${c.text || '<em style="color:var(--subtext)">No comment written.</em>'}</div>
          <button class="fav-btn${isFav ? ' fav-active' : ''}" onclick="toggleFav('${gid}','${c.name}',${idx})">
            ${isFav ? '❤️ Favorited' : '🤍 Mark as Favorite'}
          </button>
        </div>`;
      }).join('');
    }

    if (favName) {
      const idx = allComments.findIndex(c => c.name === favName);
      favNote.innerHTML = `<div class="fav-selected-note">❤️ You favorited <strong>Anonymous Faculty ${idx + 1}'s</strong> comment.</div>`;
    } else {
      favNote.innerHTML = `<span style="font-size:13px;color:var(--subtext);">You haven't picked a favorite yet. Tap ❤️ on a comment to pick one.</span>`;
    }
  }

  window.toggleFav = function(gid, facultyName, idx) {
    const current = favorites[gid];
    if (current === facultyName) {
      delete favorites[gid];
    } else {
      favorites[gid] = facultyName;
    }
    localStorage.setItem(FAV, JSON.stringify(favorites));
    renderStudentSection(gid);
  };

  // ══════════════════════════════════════════════
  // ADDING & DELETING GROUPS
  // ══════════════════════════════════════════════
  window.openAddModal = function() {
    if (currentRole !== 'faculty') return;
    ['fGroupNum','fTitle','fDesc'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fTag').value    = '';
    document.getElementById('fStage').value  = '';
    document.getElementById('fCustomTag').value = '';
    document.getElementById('fPin').value = '';
    document.getElementById('customTagWrap').style.display = 'none';
    document.getElementById('formErr').style.display = 'none';
    clearThumb();
    openModal('addModal');
  };

  window.handleTagChange = function() {
    const val  = document.getElementById('fTag').value;
    const wrap = document.getElementById('customTagWrap');
    if (val === 'Other') { wrap.style.display = 'block'; document.getElementById('fCustomTag').focus(); }
    else { wrap.style.display = 'none'; document.getElementById('fCustomTag').value = ''; }
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

  window.submitGroup = async function() {
    const gn     = document.getElementById('fGroupNum').value.trim();
    const ti     = document.getElementById('fTitle').value.trim();
    const de     = document.getElementById('fDesc').value.trim();
    const tgRaw  = document.getElementById('fTag').value;
    const st     = document.getElementById('fStage').value;
    const pin    = document.getElementById('fPin').value.trim();
    const custom = document.getElementById('fCustomTag').value.trim();
    const tg     = tgRaw === 'Other' ? custom : tgRaw;
    const er     = document.getElementById('formErr');
    const btn    = document.querySelector('.btn-submit');

    if (!gn || !ti || !de || !tgRaw || !st || !pin) {
      er.textContent = '⚠ Please fill in all required fields, including the PIN.'; er.style.display = 'block'; return;
    }
    if (tgRaw === 'Other' && !custom) {
      er.textContent = '⚠ Please enter a custom tag name.'; er.style.display = 'block';
      document.getElementById('fCustomTag').focus(); return;
    }
    er.style.display = 'none';

    btn.textContent = "Saving...";
    btn.disabled = true;

    const newGroup = { 
      id: gn, 
      groupNum: gn, 
      title: ti, 
      desc: de, 
      tag: tg, 
      stage: st, 
      pin: pin,
      thumb: thumbData || '' 
    };

    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'addGroup', ...newGroup })
      });

      groups.push(newGroup);
      currentPage = 1;
      closeModal('addModal');
      renderGrid();
    } catch (err) {
      er.textContent = '⚠️ Failed to save to database.'; er.style.display = 'block';
    } finally {
      btn.textContent = "Add Group";
      btn.disabled = false;
    }
  };

  window.askDeleteFromModal = function() {
    pendingDel = viewingGroupId;
    openModal('delModal');
  };

  window.confirmDelete = async function() {
    if (!pendingDel) return;
    
    const delBtn = document.querySelector('.btn-conf-delete');
    const origText = delBtn.textContent;
    delBtn.textContent = "Deleting...";
    delBtn.disabled = true;

    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'deleteGroup', groupId: pendingDel })
      });
    } catch(e) {
      console.log("Delete sync failed.", e);
    }

    groups = groups.filter(g => g.id !== pendingDel);
    delete ratings[pendingDel];  
    delete comments[pendingDel]; 
    delete favorites[pendingDel]; 
    localStorage.setItem(FAV, JSON.stringify(favorites));
    
    pendingDel = null;
    currentPage = 1;
    closeModal('delModal');
    closeModal('cardModal');
    renderGrid();

    delBtn.textContent = origText;
    delBtn.disabled = false;
  };

  // ══════════════════════════════════════════════
  // MODAL TOGGLES
  // ══════════════════════════════════════════════
  window.openModal    = id => document.getElementById(id).classList.add('open');
  window.closeModal   = id => document.getElementById(id).classList.remove('open');
  window.showModal    = id => document.getElementById(id).classList.add('open');
  window.overlayClick = (e, id) => { if (e.target.id === id) closeModal(id); };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { 
        closeModal('addModal'); 
        closeModal('delModal'); 
        closeModal('cardModal'); 
        closeModal('facultyNameModal');
        closeModal('studentLoginModal');
    }
  });

});