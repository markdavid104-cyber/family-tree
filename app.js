import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkMe2b2rFcr8_-9YHVQD6CBt22S7J8CLw",
  authDomain: "family-tree-1e3db.firebaseapp.com",
  projectId: "family-tree-1e3db",
  storageBucket: "family-tree-1e3db.firebasestorage.app",
  messagingSenderId: "907453025881",
  appId: "1:907453025881:web:351f55ad5e83cc7af1ab48",
};
const ADMIN_EMAIL = "markdavid104@gmail.com";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

(() => {
  "use strict";

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Static place -> [lat, lon] lookup, since the published page can't call a
  // live geocoding API. Seeded with Tamil Nadu towns, major Indian cities,
  // and common diaspora destinations. Add more here as new places appear.
  const PLACE_COORDS = {
    "thiruthangal": [9.4667, 77.7333],
    "sivakasi": [9.4491, 77.7962],
    "rajapalayam": [9.4520, 77.5540],
    "virudhunagar": [9.5851, 77.9573],
    "tenkasi": [8.9598, 77.3152],
    "tirunelveli": [8.7139, 77.7567],
    "nagercoil": [8.1780, 77.4346],
    "kanyakumari": [8.0883, 77.5385],
    "madurai": [9.9252, 78.1198],
    "dindigul": [10.3624, 77.9695],
    "theni": [10.0104, 77.4768],
    "karur": [10.9601, 78.0766],
    "trichy": [10.7905, 78.7047],
    "tiruchirappalli": [10.7905, 78.7047],
    "thanjavur": [10.7870, 79.1378],
    "kumbakonam": [10.9601, 79.3788],
    "kanchipuram": [12.8342, 79.7036],
    "cuddalore": [11.7480, 79.7714],
    "villupuram": [11.9401, 79.4861],
    "namakkal": [11.2189, 78.1677],
    "salem": [11.6643, 78.1460],
    "erode": [11.3410, 77.7172],
    "coimbatore": [11.0168, 76.9558],
    "kotagiri": [11.4237, 76.8647],
    "ooty": [11.4064, 76.6932],
    "udhagamandalam": [11.4064, 76.6932],
    "vellore": [12.9165, 79.1325],
    "thoothukudi": [8.7642, 78.1348],
    "tuticorin": [8.7642, 78.1348],
    "chennai": [13.0827, 80.2707],
    "bangalore": [12.9716, 77.5946],
    "bengaluru": [12.9716, 77.5946],
    "mumbai": [19.0760, 72.8777],
    "delhi": [28.7041, 77.1025],
    "hyderabad": [17.3850, 78.4867],
    "kolkata": [22.5726, 88.3639],
    "pune": [18.5204, 73.8567],
    "kochi": [9.9312, 76.2673],
    "tamil nadu": [11.1271, 78.6569],
    "kerala": [10.8505, 76.2711],
    "india": [20.5937, 78.9629],
    "new york": [40.7128, -74.0060],
    "san francisco": [37.7749, -122.4194],
    "chicago": [41.8781, -87.6298],
    "dallas": [32.7767, -96.7970],
    "houston": [29.7604, -95.3698],
    "london": [51.5074, -0.1278],
    "sydney": [-33.8688, 151.2093],
    "melbourne": [-37.8136, 144.9631],
    "dubai": [25.2048, 55.2708],
    "singapore": [1.3521, 103.8198],
    "toronto": [43.6532, -79.3832],
    "united states": [39.8283, -98.5795],
    "usa": [39.8283, -98.5795],
    "united kingdom": [54.0, -2.0],
    "canada": [56.1304, -106.3468],
    "australia": [-25.2744, 133.7751],
    "uae": [23.4241, 53.8478],
  };

  function geocodePlace(text) {
    if (!text) return null;
    const t = text.toLowerCase();
    const keys = Object.keys(PLACE_COORDS).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (t.includes(k)) return PLACE_COORDS[k];
    }
    return null;
  }

  let PEOPLE = {};
  let ROOT_ID = "START";
  let GENERATIONS = {};

  const state = {
    view: "explorer",
    focusId: null,
    history: [],
    historyIndex: -1,
    sortKey: "name",
  };

  // ---------------- Utilities ----------------

  function formatDate(d) {
    if (!d) return null;
    const s = String(d).padEnd(8, "0");
    const year = parseInt(s.slice(0, 4), 10);
    const month = parseInt(s.slice(4, 6), 10);
    const day = parseInt(s.slice(6, 8), 10);
    if (!year) return null;
    if (month >= 1 && month <= 12) {
      if (day >= 1 && day <= 31) return `${day} ${MONTHS[month - 1]} ${year}`;
      return `${MONTHS[month - 1]} ${year}`;
    }
    return `${year}`;
  }

  function yearOf(d) {
    if (!d) return null;
    const y = parseInt(String(d).slice(0, 4), 10);
    return y || null;
  }

  function lifespanText(p) {
    const by = yearOf(p.birthDate);
    const dy = yearOf(p.deathDate);
    if (p.deceased || dy) {
      if (by && dy) return `${by}–${dy}`;
      if (by) return `b. ${by}`;
      if (dy) return `d. ${dy}`;
      return "deceased";
    }
    if (by) return `b. ${by}`;
    return "";
  }

  function shortName(p) {
    if (!p) return "Unknown";
    return p.nickname || p.firstName || "(Unknown)";
  }

  function fullName(p) {
    if (!p) return "Unknown";
    let name = "";
    if (p.title) name += p.title + " ";
    name += p.firstName || "";
    if (p.maidenName) name += p.gender === "f" ? ` (née ${p.maidenName})` : ` (born ${p.maidenName})`;
    if (p.lastName) name += " " + p.lastName;
    return name.trim() || "(Unknown)";
  }

  function personById(id) {
    return id ? PEOPLE[id] : null;
  }

  function getSiblings(id) {
    const p = PEOPLE[id];
    if (!p) return [];
    if (!p.motherId && !p.fatherId) return [];
    const result = new Set();
    Object.values(PEOPLE).forEach((other) => {
      if (other.id === id) return;
      if (
        (p.motherId && other.motherId === p.motherId) ||
        (p.fatherId && other.fatherId === p.fatherId)
      ) {
        result.add(other.id);
      }
    });
    return Array.from(result).sort(byBirth);
  }

  function byBirth(aId, bId) {
    const a = PEOPLE[aId], b = PEOPLE[bId];
    const ay = (a && yearOf(a.birthDate)) || 9999;
    const by_ = (b && yearOf(b.birthDate)) || 9999;
    return ay - by_;
  }

  function computeGenerations() {
    const gen = {};
    const queue = [[ROOT_ID, 0]];
    gen[ROOT_ID] = 0;
    while (queue.length) {
      const [id, g] = queue.shift();
      const p = PEOPLE[id];
      if (!p) continue;
      (p.childrenIds || []).forEach((cid) => {
        if (!(cid in gen)) { gen[cid] = g + 1; queue.push([cid, g + 1]); }
      });
      [p.motherId, p.fatherId].forEach((pid) => {
        if (pid && !(pid in gen)) { gen[pid] = g - 1; queue.push([pid, g - 1]); }
      });
      (p.partners || []).forEach((sp) => {
        if (sp.id && !(sp.id in gen)) { gen[sp.id] = g; queue.push([sp.id, g]); }
      });
    }
    return gen;
  }

  function countDescendants(id, seen) {
    seen = seen || new Set();
    if (seen.has(id)) return 0;
    seen.add(id);
    const p = PEOPLE[id];
    if (!p) return 0;
    let count = 0;
    (p.childrenIds || []).forEach((cid) => {
      count += 1 + countDescendants(cid, seen);
    });
    return count;
  }

  // ---------------- Routing / history ----------------

  function navigateTo(id, opts) {
    opts = opts || {};
    if (!PEOPLE[id]) return;
    if (!opts.silent) {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(id);
      state.historyIndex = state.history.length - 1;
    }
    state.focusId = id;
    state.view = "explorer";
    activateViewUI("explorer");
    syncHash();
    render();
  }

  function goBack() {
    if (state.historyIndex > 0) {
      state.historyIndex -= 1;
      state.focusId = state.history[state.historyIndex];
      syncHash();
      render();
    }
  }

  function goForward() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex += 1;
      state.focusId = state.history[state.historyIndex];
      syncHash();
      render();
    }
  }

  function syncHash() {
    const h = `#${state.view}/${state.focusId || ""}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  function readHash() {
    const m = location.hash.match(/^#(\w+)\/([\w-]*)/);
    if (!m) return null;
    return { view: m[1], id: m[2] || null };
  }

  // ---------------- Person card ----------------

  function genderClass(p) {
    if (!p) return "u";
    return p.gender === "m" ? "m" : p.gender === "f" ? "f" : "u";
  }

  function personCard(id, opts) {
    opts = opts || {};
    const p = PEOPLE[id];
    const div = document.createElement("div");
    if (!p) {
      div.className = "person-card ghost";
      div.textContent = "Unknown";
      return div;
    }
    div.className = `person-card gender-${genderClass(p)}${opts.focused ? " focused" : ""}${p.deceased ? " deceased" : ""}`;
    const name = document.createElement("div");
    name.className = "pc-name";
    name.textContent = shortName(p);
    const sub = document.createElement("div");
    sub.className = "pc-sub";
    sub.textContent = [p.lastName, lifespanText(p)].filter(Boolean).join(" · ");
    div.appendChild(name);
    div.appendChild(sub);
    div.addEventListener("click", () => {
      if (opts.focused) openModal(id);
      else navigateTo(id);
    });
    return div;
  }

  function connectorV(height) {
    const d = document.createElement("div");
    d.className = "connector";
    if (height) d.style.height = height + "px";
    return d;
  }

  // ---------------- Explorer view ----------------

  function renderExplorer() {
    const canvas = document.getElementById("explorer-canvas");
    canvas.innerHTML = "";
    const p = PEOPLE[state.focusId];
    if (!p) {
      canvas.innerHTML = '<div class="empty-note">Person not found.</div>';
      return;
    }

    // Parents row
    if (p.motherId || p.fatherId) {
      const row = document.createElement("div");
      row.className = "rel-row parents";
      if (p.motherId) row.appendChild(personCard(p.motherId));
      if (p.fatherId) row.appendChild(personCard(p.fatherId));
      canvas.appendChild(row);
      canvas.appendChild(connectorV(20));
    }

    if (p.additionalParentSets && p.additionalParentSets.length) {
      p.additionalParentSets.forEach((set) => {
        if (!set.motherId && !set.fatherId) return;
        const label = document.createElement("div");
        label.className = "section-label";
        label.textContent = set.type ? `Also (${set.type})` : "Also raised by";
        canvas.appendChild(label);
        const row = document.createElement("div");
        row.className = "rel-row parents";
        if (set.motherId) row.appendChild(personCard(set.motherId));
        if (set.fatherId) row.appendChild(personCard(set.fatherId));
        canvas.appendChild(row);
      });
    }

    // Focus row: siblings - focus - spouses
    const focusRow = document.createElement("div");
    focusRow.className = "rel-row focus-row";

    getSiblings(state.focusId).forEach((sid) => {
      focusRow.appendChild(personCard(sid));
    });

    focusRow.appendChild(personCard(state.focusId, { focused: true }));

    (p.partners || []).forEach((sp) => {
      const wrap = document.createElement("div");
      wrap.className = "couple-wrap";
      const line = document.createElement("div");
      line.className = "connector-h";
      line.style.width = "14px";
      wrap.appendChild(line);
      const spouseWrap = document.createElement("div");
      spouseWrap.appendChild(personCard(sp.id));
      const info = document.createElement("div");
      info.className = "marriage-info";
      const bits = [];
      if (sp.marriageDate) bits.push("m. " + formatDate(sp.marriageDate));
      if (sp.weddingPlace) bits.push(sp.weddingPlace);
      info.textContent = bits.join(" · ");
      spouseWrap.appendChild(info);
      wrap.appendChild(spouseWrap);
      focusRow.appendChild(wrap);
    });

    canvas.appendChild(focusRow);

    // Children row
    const children = (p.childrenIds || []).slice().sort(byBirth);
    if (children.length) {
      canvas.appendChild(connectorV(20));
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = `Children (${children.length})`;
      canvas.appendChild(label);
      const row = document.createElement("div");
      row.className = "rel-row children";
      children.forEach((cid) => row.appendChild(personCard(cid)));
      canvas.appendChild(row);
    }

    updateBreadcrumb();
  }

  function updateBreadcrumb() {
    const el = document.getElementById("breadcrumb");
    const p = PEOPLE[state.focusId];
    el.textContent = p ? `Viewing: ${fullName(p)}` : "";
    document.getElementById("btn-back").disabled = state.historyIndex <= 0;
    document.getElementById("btn-forward").disabled = state.historyIndex >= state.history.length - 1;
  }

  // ---------------- Modal ----------------

  let currentModalId = null;

  function openModal(id) {
    const p = PEOPLE[id];
    if (!p) return;
    currentModalId = id;
    document.getElementById("modal-edit").style.display = "";
    const body = document.getElementById("modal-body");
    body.innerHTML = "";

    const title = document.createElement("div");
    title.className = "modal-title";
    title.textContent = fullName(p);
    body.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "modal-sub";
    const genderLabel = p.gender === "m" ? "Male" : p.gender === "f" ? "Female" : "Unknown";
    sub.textContent = `${genderLabel}${p.nickname ? " · called “" + p.nickname + "”" : ""}`;
    body.appendChild(sub);

    function section(title, contentEl) {
      const s = document.createElement("div");
      s.className = "modal-section";
      const h = document.createElement("h4");
      h.textContent = title;
      s.appendChild(h);
      s.appendChild(contentEl);
      body.appendChild(s);
    }

    function row(text) {
      const r = document.createElement("div");
      r.className = "modal-row";
      r.textContent = text;
      return r;
    }

    function chipList(ids) {
      const wrap = document.createElement("div");
      wrap.className = "modal-chip-list";
      ids.forEach((cid) => {
        const other = PEOPLE[cid];
        const chip = document.createElement("span");
        chip.className = "modal-chip";
        chip.textContent = other ? `${shortName(other)} ${other.lastName || ""}`.trim() : "Unknown";
        chip.addEventListener("click", () => {
          closeModal();
          navigateTo(cid);
        });
        wrap.appendChild(chip);
      });
      return wrap;
    }

    const lifeWrap = document.createElement("div");
    const bd = formatDate(p.birthDate);
    lifeWrap.appendChild(row(`Born: ${bd || "Unknown"}${p.birthPlace ? " in " + p.birthPlace : ""}`));
    if (p.residence && !p.deceased) lifeWrap.appendChild(row(`Lives in: ${p.residence}`));
    if (p.deceased) {
      const dd = formatDate(p.deathDate);
      lifeWrap.appendChild(row(`Died: ${dd || "Unknown date"}`));
    }
    section("Life", lifeWrap);

    if (p.motherId || p.fatherId) {
      section("Parents", chipList([p.motherId, p.fatherId].filter(Boolean)));
    }

    const siblings = getSiblings(id);
    if (siblings.length) section("Siblings", chipList(siblings));

    if (p.partners && p.partners.length) {
      const wrap = document.createElement("div");
      p.partners.forEach((sp) => {
        const other = PEOPLE[sp.id];
        const line = document.createElement("div");
        line.className = "modal-row";
        const bits = [shortName(other) + " " + (other ? other.lastName || "" : "")];
        if (sp.marriageDate) bits.push("married " + formatDate(sp.marriageDate));
        if (sp.weddingPlace) bits.push("in " + sp.weddingPlace);
        line.textContent = bits.join(" — ");
        line.style.cursor = "pointer";
        line.addEventListener("click", () => { closeModal(); navigateTo(sp.id); });
        wrap.appendChild(line);
      });
      section("Spouse(s)", wrap);
    }

    if (p.childrenIds && p.childrenIds.length) {
      section("Children", chipList(p.childrenIds));
    }

    document.getElementById("detail-modal").classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("detail-modal").classList.add("hidden");
  }

  // ---------------- Full tree view ----------------

  function getFounders() {
    return Object.values(PEOPLE)
      .filter((p) => !p.motherId && !p.fatherId)
      .sort((a, b) => countDescendants(b.id) - countDescendants(a.id));
  }

  function findFounderPathTo(id) {
    const path = [id];
    const seen = new Set([id]);
    let cur = PEOPLE[id];
    while (cur && (cur.fatherId || cur.motherId)) {
      const nextId = (cur.fatherId && PEOPLE[cur.fatherId]) ? cur.fatherId
        : (cur.motherId && PEOPLE[cur.motherId] ? cur.motherId : null);
      if (!nextId || seen.has(nextId)) break;
      path.push(nextId);
      seen.add(nextId);
      cur = PEOPLE[nextId];
    }
    return path.reverse();
  }

  let treeRootId = null;
  let lastTreeRootId = null;

  function resetCollapseDefaults(rootId) {
    collapsedNodes.clear();
    const p = PEOPLE[rootId];
    if (!p) return;
    (p.childrenIds || []).forEach((cid) => {
      const c = PEOPLE[cid];
      if (c && (c.childrenIds || []).length) collapsedNodes.add(cid);
    });
  }

  function initTreeView() {
    const select = document.getElementById("tree-root-select");
    select.innerHTML = "";
    const founders = getFounders();
    founders.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.id;
      const desc = countDescendants(f.id);
      opt.textContent = `${fullName(f)} (${desc} descendant${desc === 1 ? "" : "s"})`;
      select.appendChild(opt);
    });
    if (!treeRootId && founders.length) treeRootId = founders[0].id;
    if (treeRootId !== lastTreeRootId) {
      resetCollapseDefaults(treeRootId);
      lastTreeRootId = treeRootId;
    }
    select.value = treeRootId;
    select.onchange = () => {
      treeRootId = select.value;
      renderTree();
    };
  }

  // Geometric tree diagram: a real branching chart with connector lines,
  // pan and zoom, instead of an indented list.

  const UNIT_W = 168;
  const ROW_H = 128;
  const NODE_H = 58;

  const collapsedNodes = new Set();
  let treeZoom = 1;

  function computeLayout(rootId) {
    const nodes = {};
    let cursor = 0;
    const visited = new Set();

    function visit(id, depth) {
      const p = PEOPLE[id];
      if (!p || visited.has(id)) { const x = cursor + 0.5; cursor += 1; return x; }
      visited.add(id);

      const spouseIds = (p.partners || []).map((s) => s.id).filter((sid) => PEOPLE[sid]);
      const selfWidth = 1 + spouseIds.length * 0.62;
      const hasChildren = (p.childrenIds || []).length > 0;
      const expanded = hasChildren && !collapsedNodes.has(id);

      let x;
      if (!expanded) {
        x = cursor + selfWidth / 2;
        cursor += selfWidth;
      } else {
        const children = p.childrenIds.slice().sort(byBirth);
        const childXs = children.map((cid) => visit(cid, depth + 1));
        const first = childXs[0], last = childXs[childXs.length - 1];
        x = (first + last) / 2;
        const minCursor = x + selfWidth / 2;
        if (minCursor > cursor) cursor = minCursor;
      }

      nodes[id] = { id, x, depth, y: depth * ROW_H, hasChildren, expanded, spouseIds, width: selfWidth };
      return x;
    }

    visit(rootId, 0);
    return { nodes, totalUnits: cursor };
  }

  function treeLine(x, y, w, h, gray) {
    const d = document.createElement("div");
    d.className = "tree-line" + (gray ? " gray" : "");
    d.style.left = x + "px";
    d.style.top = y + "px";
    d.style.width = Math.max(w, 1) + "px";
    d.style.height = Math.max(h, 1) + "px";
    return d;
  }

  function renderTreeNodeBox(n) {
    const p = PEOPLE[n.id];
    const box = document.createElement("div");
    box.className = "tree-unit";
    box.style.left = (n.x * UNIT_W - (n.width * UNIT_W) / 2) + "px";
    box.style.top = n.y + "px";
    box.style.width = (n.width * UNIT_W) + "px";

    const card = document.createElement("div");
    card.className = `tree-card gender-${genderClass(p)}${p.deceased ? " deceased" : ""}`;
    const name = document.createElement("div");
    name.className = "tc-name";
    name.textContent = shortName(p) + (p.lastName ? " " + p.lastName : "");
    const sub = document.createElement("div");
    sub.className = "tc-sub";
    sub.textContent = lifespanText(p);
    card.appendChild(name);
    card.appendChild(sub);
    card.addEventListener("click", () => openModal(n.id));

    if (n.hasChildren) {
      const toggle = document.createElement("button");
      toggle.className = "tree-toggle";
      toggle.type = "button";
      toggle.textContent = n.expanded ? "−" : "+";
      toggle.title = n.expanded ? "Collapse" : "Expand";
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        if (collapsedNodes.has(n.id)) collapsedNodes.delete(n.id);
        else collapsedNodes.add(n.id);
        renderTree();
      });
      card.appendChild(toggle);
    }

    box.appendChild(card);

    n.spouseIds.forEach((sid) => {
      const sp = PEOPLE[sid];
      const chip = document.createElement("div");
      chip.className = `tree-spouse-chip gender-${genderClass(sp)}${sp.deceased ? " deceased" : ""}`;
      chip.textContent = shortName(sp);
      chip.title = fullName(sp);
      chip.addEventListener("click", () => openModal(sid));
      box.appendChild(chip);
    });

    return box;
  }

  function renderTree(centerId) {
    initTreeView();
    const canvas = document.getElementById("tree-canvas");
    canvas.innerHTML = "";
    if (!treeRootId) {
      canvas.innerHTML = '<div class="empty-note">No ancestors found.</div>';
      return;
    }

    const { nodes, totalUnits } = computeLayout(treeRootId);
    const maxDepth = Math.max(...Object.values(nodes).map((n) => n.depth));
    canvas.style.width = (totalUnits * UNIT_W + 40) + "px";
    canvas.style.height = ((maxDepth + 1) * ROW_H + NODE_H + 40) + "px";
    canvas.style.transform = `scale(${treeZoom})`;

    // Connector lines first, underneath the node boxes.
    Object.values(nodes).forEach((n) => {
      if (!n.expanded) return;
      const p = PEOPLE[n.id];
      const children = p.childrenIds.slice().sort(byBirth).map((cid) => nodes[cid]).filter(Boolean);
      if (!children.length) return;

      const parentPx = n.x * UNIT_W;
      const parentBottom = n.y + NODE_H;
      const busY = parentBottom + (ROW_H - NODE_H) / 2;
      const childPxs = children.map((c) => c.x * UNIT_W);
      const minX = Math.min(parentPx, ...childPxs);
      const maxX = Math.max(parentPx, ...childPxs);

      canvas.appendChild(treeLine(parentPx, parentBottom, 2, busY - parentBottom));
      if (children.length > 1) canvas.appendChild(treeLine(minX, busY, maxX - minX, 2));
      children.forEach((c) => {
        canvas.appendChild(treeLine(c.x * UNIT_W, busY, 2, c.y - busY));
      });
    });

    Object.values(nodes).forEach((n) => canvas.appendChild(renderTreeNodeBox(n)));

    const targetNode = nodes[centerId] || nodes[treeRootId];
    const wrap = document.getElementById("tree-canvas-wrap");
    if (targetNode) {
      const targetPx = targetNode.x * UNIT_W + 20;
      wrap.scrollLeft = Math.max(0, targetPx - wrap.clientWidth / 2);
      wrap.scrollTop = Math.max(0, targetNode.y - wrap.clientHeight / 2 + 20);
    }
  }

  function setTreeZoom(z) {
    treeZoom = Math.min(1.5, Math.max(0.35, z));
    const canvas = document.getElementById("tree-canvas");
    canvas.style.transform = `scale(${treeZoom})`;
    document.getElementById("btn-zoom-reset").textContent = Math.round(treeZoom * 100) + "%";
  }

  document.getElementById("btn-expand-all").addEventListener("click", () => {
    collapsedNodes.clear();
    renderTree();
  });
  document.getElementById("btn-collapse-all").addEventListener("click", () => {
    const p = PEOPLE[treeRootId];
    if (p) (p.childrenIds || []).forEach((cid) => collapsedNodes.add(cid));
    renderTree();
  });
  document.getElementById("btn-zoom-in").addEventListener("click", () => setTreeZoom(treeZoom + 0.15));
  document.getElementById("btn-zoom-out").addEventListener("click", () => setTreeZoom(treeZoom - 0.15));
  document.getElementById("btn-zoom-reset").addEventListener("click", () => setTreeZoom(1));

  function getMeId() {
    let stored = null;
    try { stored = localStorage.getItem("familyTreeMeId"); } catch (e) {}
    return (stored && PEOPLE[stored]) ? stored : ROOT_ID;
  }
  function setMeId(id) {
    try { localStorage.setItem("familyTreeMeId", id); } catch (e) {}
  }
  function updateGoToMeLabel() {
    const p = PEOPLE[getMeId()];
    const btn = document.getElementById("btn-go-to-me");
    if (btn && p) btn.textContent = "🎯 Go to " + shortName(p);
  }

  document.getElementById("btn-go-to-me").addEventListener("click", () => {
    const meId = getMeId();
    const path = findFounderPathTo(meId);
    if (!path.length) return;
    treeRootId = path[0];
    lastTreeRootId = treeRootId;
    path.forEach((pid) => collapsedNodes.delete(pid));
    renderTree(meId);
  });

  (function setupTreePan() {
    const wrap = document.getElementById("tree-canvas-wrap");
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    wrap.addEventListener("mousedown", (e) => {
      if (e.target.closest(".tree-card, .tree-spouse-chip, .tree-toggle")) return;
      dragging = true;
      wrap.classList.add("grabbing");
      startX = e.clientX; startY = e.clientY;
      startLeft = wrap.scrollLeft; startTop = wrap.scrollTop;
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      wrap.scrollLeft = startLeft - (e.clientX - startX);
      wrap.scrollTop = startTop - (e.clientY - startY);
    });
    window.addEventListener("mouseup", () => { dragging = false; wrap.classList.remove("grabbing"); });
  })();

  // ---------------- Browse all view ----------------

  function renderBrowse() {
    const tbody = document.getElementById("browse-tbody");
    tbody.innerHTML = "";
    let ids = Object.keys(PEOPLE);

    if (state.sortKey === "name") {
      ids.sort((a, b) => {
        const pa = PEOPLE[a], pb = PEOPLE[b];
        return (pa.lastName || "").localeCompare(pb.lastName || "") || (pa.firstName || "").localeCompare(pb.firstName || "");
      });
    } else if (state.sortKey === "birth") {
      ids.sort((a, b) => (yearOf(PEOPLE[a].birthDate) || 9999) - (yearOf(PEOPLE[b].birthDate) || 9999));
    } else if (state.sortKey === "generation") {
      ids.sort((a, b) => (GENERATIONS[a] ?? 999) - (GENERATIONS[b] ?? 999));
    }

    document.getElementById("browse-count").textContent = `${ids.length} people`;

    const frag = document.createDocumentFragment();
    ids.forEach((id) => {
      const p = PEOPLE[id];
      const tr = document.createElement("tr");
      tr.dataset.id = id;

      const tdName = document.createElement("td");
      tdName.className = "name-cell";
      tdName.textContent = fullName(p);

      const tdGender = document.createElement("td");
      tdGender.textContent = p.gender === "m" ? "M" : p.gender === "f" ? "F" : "–";

      const tdBorn = document.createElement("td");
      tdBorn.textContent = formatDate(p.birthDate) || "–";

      const tdDied = document.createElement("td");
      tdDied.textContent = p.deceased ? (formatDate(p.deathDate) || "yes") : "–";

      const tdParents = document.createElement("td");
      const parentNames = [p.motherId, p.fatherId].filter(Boolean).map((pid) => PEOPLE[pid] ? shortName(PEOPLE[pid]) : null).filter(Boolean);
      tdParents.textContent = parentNames.join(" & ") || "–";

      tr.appendChild(tdName);
      tr.appendChild(tdGender);
      tr.appendChild(tdBorn);
      tr.appendChild(tdDied);
      tr.appendChild(tdParents);
      tr.addEventListener("click", () => navigateTo(id));
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  document.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.sortKey = btn.dataset.sort;
      renderBrowse();
    });
  });

  // ---------------- Map view ----------------

  let mapMode = "both";
  document.querySelectorAll('input[name="map-mode"]').forEach((r) => {
    r.addEventListener("change", () => { mapMode = r.value; renderMap(); });
  });

  let mapZoom = 1;
  function setMapZoom(z) {
    mapZoom = Math.min(4, Math.max(1, z));
    document.getElementById("map-wrap").style.transform = `scale(${mapZoom})`;
    document.getElementById("btn-map-zoom-reset").textContent = Math.round(mapZoom * 100) + "%";
  }
  document.getElementById("btn-map-zoom-in").addEventListener("click", () => setMapZoom(mapZoom + 0.5));
  document.getElementById("btn-map-zoom-out").addEventListener("click", () => setMapZoom(mapZoom - 0.5));
  document.getElementById("btn-map-zoom-reset").addEventListener("click", () => setMapZoom(1));

  (function setupMapPan() {
    const viewport = document.getElementById("map-viewport");
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    viewport.addEventListener("mousedown", (e) => {
      if (e.target.closest(".map-pin, .map-popover")) return;
      dragging = true;
      viewport.classList.add("grabbing");
      startX = e.clientX; startY = e.clientY;
      startLeft = viewport.scrollLeft; startTop = viewport.scrollTop;
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      viewport.scrollLeft = startLeft - (e.clientX - startX);
      viewport.scrollTop = startTop - (e.clientY - startY);
    });
    window.addEventListener("mouseup", () => { dragging = false; viewport.classList.remove("grabbing"); });
  })();

  function closeMapPopover() {
    const existing = document.querySelector(".map-popover");
    if (existing) existing.remove();
  }

  function renderMap() {
    const pinsLayer = document.getElementById("map-pins");
    const unplacedEl = document.getElementById("map-unplaced");
    pinsLayer.innerHTML = "";
    closeMapPopover();

    const buckets = {};
    const unplaced = new Set();

    Object.values(PEOPLE).forEach((p) => {
      const entries = [];
      if ((mapMode === "both" || mapMode === "birth") && p.birthPlace) entries.push({ place: p.birthPlace, tag: "born" });
      if ((mapMode === "both" || mapMode === "residence") && p.residence) entries.push({ place: p.residence, tag: "lives" });
      entries.forEach(({ place, tag }) => {
        const coords = geocodePlace(place);
        if (!coords) { unplaced.add(place); return; }
        const key = coords[0] + "," + coords[1];
        if (!buckets[key]) buckets[key] = { lat: coords[0], lon: coords[1], people: [], places: new Set() };
        buckets[key].people.push({ id: p.id, tag });
        buckets[key].places.add(place);
      });
    });

    Object.values(buckets).forEach((bucket) => {
      const leftPct = ((bucket.lon + 180) / 360) * 100;
      const topPct = ((90 - bucket.lat) / 180) * 100;

      const pin = document.createElement("div");
      pin.className = "map-pin";
      pin.style.left = leftPct + "%";
      pin.style.top = topPct + "%";

      const dot = document.createElement("div");
      dot.className = "map-pin-dot";
      pin.appendChild(dot);

      if (bucket.people.length > 1) {
        const count = document.createElement("div");
        count.className = "map-pin-count";
        count.textContent = bucket.people.length;
        pin.appendChild(count);
      }

      const label = document.createElement("div");
      label.className = "map-pin-label";
      label.textContent = Array.from(bucket.places).join(" / ");
      pin.appendChild(label);

      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMapPopover();
        const pop = document.createElement("div");
        pop.className = "map-popover";
        pop.style.left = leftPct + "%";
        pop.style.top = topPct + "%";
        const title = document.createElement("div");
        title.className = "map-popover-title";
        title.textContent = Array.from(bucket.places).join(" / ");
        pop.appendChild(title);
        const subtitle = document.createElement("div");
        subtitle.className = "map-popover-sub";
        subtitle.textContent = `${bucket.people.length} ${bucket.people.length === 1 ? "person" : "people"}`;
        pop.appendChild(subtitle);
        bucket.people.forEach((entry) => {
          const person = PEOPLE[entry.id];
          const item = document.createElement("div");
          item.className = "map-popover-item";
          item.innerHTML = `${shortName(person)} ${person.lastName || ""} <span class="mp-tag">(${entry.tag})</span>`;
          item.addEventListener("click", () => { closeMapPopover(); openModal(entry.id); });
          pop.appendChild(item);
        });
        document.getElementById("map-wrap").appendChild(pop);
      });

      pinsLayer.appendChild(pin);
    });

    if (unplaced.size) {
      unplacedEl.textContent = `Not shown on the map yet (unrecognized place name): ${Array.from(unplaced).join(", ")}. Tell Mark the correct town/city and it can be added.`;
    } else {
      unplacedEl.textContent = "";
    }
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".map-popover, .map-pin")) closeMapPopover();
  });

  // ---------------- Search ----------------

  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");

  function matchesQuery(p, q) {
    const hay = [p.firstName, p.lastName, p.nickname, p.maidenName].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  }

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { searchResults.classList.add("hidden"); searchResults.innerHTML = ""; return; }
    const matches = Object.values(PEOPLE).filter((p) => matchesQuery(p, q)).slice(0, 20);
    searchResults.innerHTML = "";
    if (!matches.length) {
      searchResults.innerHTML = '<div class="search-result-item">No matches</div>';
    } else {
      matches.forEach((p) => {
        const item = document.createElement("div");
        item.className = "search-result-item";

        const nameSpan = document.createElement("span");
        nameSpan.className = "sr-name";
        nameSpan.innerHTML = `${fullName(p)}<span class="sr-life">${lifespanText(p)}</span>`;
        nameSpan.addEventListener("click", () => {
          searchInput.value = "";
          searchResults.classList.add("hidden");
          navigateTo(p.id);
        });

        const setMeBtn = document.createElement("button");
        setMeBtn.type = "button";
        setMeBtn.className = "sr-setme" + (getMeId() === p.id ? " active" : "");
        setMeBtn.textContent = getMeId() === p.id ? "✓ You" : "Set as me";
        setMeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          setMeId(p.id);
          updateGoToMeLabel();
          document.querySelectorAll(".sr-setme").forEach((b) => { b.classList.remove("active"); b.textContent = "Set as me"; });
          setMeBtn.classList.add("active");
          setMeBtn.textContent = "✓ You";
        });

        item.appendChild(nameSpan);
        item.appendChild(setMeBtn);
        searchResults.appendChild(item);
      });
    }
    searchResults.classList.remove("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) searchResults.classList.add("hidden");
  });

  // ---------------- View switching ----------------

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setView(btn.dataset.view);
    });
  });

  function activateViewUI(view) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    document.getElementById(`view-${view}`).classList.remove("hidden");
  }

  function setView(view) {
    state.view = view;
    activateViewUI(view);
    syncHash();
    render();
  }

  function render() {
    if (state.dataError) return;
    if (state.view === "explorer") renderExplorer();
    else if (state.view === "tree") renderTree();
    else if (state.view === "browse") renderBrowse();
    else if (state.view === "map") renderMap();
    else if (state.view === "pending") renderPending();
  }

  function showDataError(message) {
    state.dataError = message;
    document.querySelectorAll(".view").forEach((v) => {
      v.querySelectorAll(".explorer-canvas, .tree-canvas, #browse-table-wrap, .explorer-toolbar, .tree-toolbar, .browse-toolbar").forEach((el) => el.remove());
      const note = document.createElement("div");
      note.className = "empty-note";
      note.textContent = message;
      v.appendChild(note);
    });
  }

  // ---------------- Toolbar buttons ----------------

  document.getElementById("btn-back").addEventListener("click", goBack);
  document.getElementById("btn-forward").addEventListener("click", goForward);
  document.getElementById("btn-home").addEventListener("click", () => navigateTo(ROOT_ID));
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.querySelector(".modal-backdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // ---------------- Editing ----------------

  function genId() {
    let id;
    do { id = "P" + Math.random().toString(36).slice(2, 8).toUpperCase(); } while (PEOPLE[id]);
    return id;
  }

  function blankPerson(id) {
    return {
      id, firstName: "", lastName: "", maidenName: null, nickname: null, title: null,
      gender: null, birthDate: null, deathDate: null, deceased: false, birthPlace: null,
      residence: null, motherId: null, fatherId: null, additionalParentSets: [], partners: [], childrenIds: [],
    };
  }

  function setParentRelation(childId, role, newParentId) {
    const child = PEOPLE[childId];
    if (!child) return;
    const field = role === "mother" ? "motherId" : "fatherId";
    const oldId = child[field];
    if (oldId && PEOPLE[oldId]) {
      PEOPLE[oldId].childrenIds = (PEOPLE[oldId].childrenIds || []).filter((cid) => cid !== childId);
      markDirty(oldId);
    }
    child[field] = newParentId || null;
    markDirty(childId);
    if (newParentId && PEOPLE[newParentId]) {
      if (!PEOPLE[newParentId].childrenIds) PEOPLE[newParentId].childrenIds = [];
      if (!PEOPLE[newParentId].childrenIds.includes(childId)) PEOPLE[newParentId].childrenIds.push(childId);
      markDirty(newParentId);
    }
  }

  function addChildRelation(parentId, childId) {
    const parent = PEOPLE[parentId];
    if (!parent) return;
    const role = parent.gender === "f" ? "mother" : "father";
    setParentRelation(childId, role, parentId);
  }

  function removeChildRelation(parentId, childId) {
    const child = PEOPLE[childId];
    const parent = PEOPLE[parentId];
    if (!parent) return;
    if (child) {
      if (child.motherId === parentId) child.motherId = null;
      if (child.fatherId === parentId) child.fatherId = null;
      markDirty(childId);
    }
    parent.childrenIds = (parent.childrenIds || []).filter((cid) => cid !== childId);
    markDirty(parentId);
  }

  function addSpouseRelation(idA, idB) {
    const a = PEOPLE[idA], b = PEOPLE[idB];
    if (!a || !b) return;
    if (!a.partners) a.partners = [];
    if (!b.partners) b.partners = [];
    if (!a.partners.some((sp) => sp.id === idB)) {
      a.partners.push({ id: idB, marriageDate: null, weddingPlace: null, extraType: null, isPrimary: a.partners.length === 0 });
    }
    if (!b.partners.some((sp) => sp.id === idA)) {
      b.partners.push({ id: idA, marriageDate: null, weddingPlace: null, extraType: null, isPrimary: b.partners.length === 0 });
    }
    markDirty(idA);
    markDirty(idB);
  }

  function removeSpouseRelation(idA, idB) {
    if (PEOPLE[idA]) PEOPLE[idA].partners = (PEOPLE[idA].partners || []).filter((sp) => sp.id !== idB);
    if (PEOPLE[idB]) PEOPLE[idB].partners = (PEOPLE[idB].partners || []).filter((sp) => sp.id !== idA);
    markDirty(idA);
    markDirty(idB);
  }

  function removePerson(id) {
    if (id === ROOT_ID) {
      alert(`${shortName(PEOPLE[id])} is this tree's starting person and can't be deleted.`);
      return false;
    }
    Object.entries(PEOPLE).forEach(([pid, person]) => {
      if (pid === id) return;
      const before = JSON.stringify(person);
      person.partners = (person.partners || []).filter((sp) => sp.id !== id);
      person.childrenIds = (person.childrenIds || []).filter((cid) => cid !== id);
      if (person.motherId === id) person.motherId = null;
      if (person.fatherId === id) person.fatherId = null;
      (person.additionalParentSets || []).forEach((set) => {
        if (set.motherId === id) set.motherId = null;
        if (set.fatherId === id) set.fatherId = null;
      });
      if (JSON.stringify(person) !== before) markDirty(pid);
    });
    delete PEOPLE[id];
    markDirty(id, "delete");
    return true;
  }

  // ---------------- Firestore sync ----------------

  let currentUserEmail = null;
  let isApprover = false;
  let dirtyIds = new Map(); // id -> "upsert" | "delete"

  function markDirty(id, action) {
    if (!id) return;
    dirtyIds.set(id, action || "upsert");
  }

  function sanitizeForFirestore(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  async function loadPeopleFromFirestore() {
    const snap = await getDocs(collection(db, "people"));
    const data = {};
    snap.forEach((d) => { data[d.id] = d.data(); });
    PEOPLE = data;
  }

  async function submitPendingChange(summary, proposedPeople) {
    const changeRef = doc(collection(db, "pendingChanges"));
    await setDoc(changeRef, {
      summary,
      proposedPeople: sanitizeForFirestore(proposedPeople),
      submittedBy: currentUserEmail,
      submittedAt: serverTimestamp(),
      status: "pending",
    });
  }

  function updateAccountInfo() {
    const el = document.getElementById("tools-account-info");
    if (!el) return;
    el.innerHTML = `Signed in as<br><strong>${currentUserEmail || ""}</strong><br>${isApprover ? "Approver" : "Viewer (edits need approval)"}`;
    document.getElementById("btn-manage-access").classList.toggle("hidden", !isApprover);
    document.getElementById("tab-pending").classList.toggle("hidden", !isApprover);
  }

  function localRefresh() {
    GENERATIONS = computeGenerations();
    render();
  }

  async function refreshAfterEdit(summary) {
    const changes = new Map(dirtyIds);
    dirtyIds = new Map();
    if (changes.size === 0) { render(); return; }

    if (isApprover) {
      const writes = [];
      changes.forEach((action, id) => {
        if (action === "delete") writes.push(deleteDoc(doc(db, "people", id)));
        else writes.push(setDoc(doc(db, "people", id), sanitizeForFirestore(PEOPLE[id])));
      });
      try { await Promise.all(writes); } catch (e) { alert("Could not save: " + e.message); }
      GENERATIONS = computeGenerations();
      render();
    } else {
      const proposedPeople = {};
      changes.forEach((action, id) => { proposedPeople[id] = action === "delete" ? null : PEOPLE[id]; });
      try {
        await submitPendingChange(summary || "Requested change", proposedPeople);
        alert("Your change has been submitted for approval. It won't appear for others until an approver reviews it.");
      } catch (e) {
        alert("Could not submit your change: " + e.message);
      }
      await loadPeopleFromFirestore();
      GENERATIONS = computeGenerations();
      render();
    }
  }

  function parseDateParts(d) {
    if (!d) return { y: "", m: "", day: "" };
    const s = String(d).padEnd(8, "0");
    const y = parseInt(s.slice(0, 4), 10);
    const m = parseInt(s.slice(4, 6), 10);
    const day = parseInt(s.slice(6, 8), 10);
    return { y: y ? String(y) : "", m: m ? String(m).padStart(2, "0") : "", day: day ? String(day).padStart(2, "0") : "" };
  }

  function combineDateParts(y, m, day) {
    y = (y || "").trim(); m = (m || "").trim(); day = (day || "").trim();
    if (!y) return null;
    const yy = y.padStart(4, "0").slice(-4);
    const mm = m ? m.padStart(2, "0") : "00";
    const dd = day ? day.padStart(2, "0") : "00";
    return yy + mm + dd;
  }

  function buildPersonSelect(selectedId, excludeId) {
    const select = document.createElement("select");
    const noneOpt = document.createElement("option");
    noneOpt.value = ""; noneOpt.textContent = "— none —";
    select.appendChild(noneOpt);
    Object.values(PEOPLE)
      .filter((pp) => pp.id !== excludeId)
      .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || "") || (a.firstName || "").localeCompare(b.firstName || ""))
      .forEach((pp) => {
        const opt = document.createElement("option");
        opt.value = pp.id; opt.textContent = fullName(pp);
        if (pp.id === selectedId) opt.selected = true;
        select.appendChild(opt);
      });
    return select;
  }

  function buildAddPersonSelect() {
    const select = document.createElement("select");
    const placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = "+ Add…"; placeholder.selected = true;
    select.appendChild(placeholder);
    const newOpt = document.createElement("option");
    newOpt.value = "__new__"; newOpt.textContent = "+ Create a new person";
    select.appendChild(newOpt);
    Object.values(PEOPLE)
      .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || "") || (a.firstName || "").localeCompare(b.firstName || ""))
      .forEach((pp) => {
        const opt = document.createElement("option");
        opt.value = pp.id; opt.textContent = fullName(pp);
        select.appendChild(opt);
      });
    return select;
  }

  function openEditForm(id, isNew) {
    const p = PEOPLE[id];
    if (!p) return;
    currentModalId = id;
    document.getElementById("modal-edit").style.display = "none";
    const draft = Object.assign({}, p);

    const body = document.getElementById("modal-body");
    body.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "modal-title";
    heading.textContent = isNew ? "New person" : ("Edit " + fullName(p));
    body.appendChild(heading);

    const note = document.createElement("div");
    note.className = "edit-note";
    note.textContent = "Saved on this device only. Open the ⚙ menu → “Copy data as text” and send it back to have your edits published for everyone.";
    body.appendChild(note);

    function textField(labelText, value, onInput, placeholder) {
      const wrap = document.createElement("div");
      wrap.className = "edit-form-row";
      const label = document.createElement("label");
      label.textContent = labelText;
      const input = document.createElement("input");
      input.type = "text";
      input.value = value || "";
      if (placeholder) input.placeholder = placeholder;
      wrap.appendChild(label); wrap.appendChild(input);
      return { wrap, input };
    }

    function bindText(labelText, key, placeholder) {
      const { wrap, input } = textField(labelText, draft[key], null, placeholder);
      input.addEventListener("input", () => { draft[key] = input.value; });
      return wrap;
    }

    const twoCol = document.createElement("div");
    twoCol.className = "edit-form-two-col";
    twoCol.appendChild(bindText("Title", "title", "Dr, Mr, …"));
    twoCol.appendChild(bindText("Nickname", "nickname"));
    body.appendChild(twoCol);

    body.appendChild(bindText("First / given name(s)", "firstName"));
    body.appendChild(bindText("Last / family name", "lastName"));
    body.appendChild(bindText("Maiden / birth-family name", "maidenName"));

    const genderWrap = document.createElement("div");
    genderWrap.className = "edit-form-row";
    const genderLabel = document.createElement("label");
    genderLabel.textContent = "Gender";
    const genderSelect = document.createElement("select");
    [["", "Unknown"], ["f", "Female"], ["m", "Male"]].forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val; opt.textContent = label;
      if ((draft.gender || "") === val) opt.selected = true;
      genderSelect.appendChild(opt);
    });
    genderSelect.addEventListener("change", () => { draft.gender = genderSelect.value || null; });
    genderWrap.appendChild(genderLabel); genderWrap.appendChild(genderSelect);
    body.appendChild(genderWrap);

    function dateFieldGroup(labelText, value, onChange) {
      const wrap = document.createElement("div");
      wrap.className = "edit-form-row";
      const label = document.createElement("label");
      label.textContent = labelText;
      const group = document.createElement("div");
      group.className = "edit-date-group";
      const parts = parseDateParts(value);
      const yInput = document.createElement("input");
      yInput.className = "yr"; yInput.placeholder = "Year"; yInput.value = parts.y; yInput.maxLength = 4; yInput.inputMode = "numeric";
      const mInput = document.createElement("input");
      mInput.className = "mo"; mInput.placeholder = "Month"; mInput.value = parts.m; mInput.maxLength = 2; mInput.inputMode = "numeric";
      const dInput = document.createElement("input");
      dInput.className = "dy"; dInput.placeholder = "Day"; dInput.value = parts.day; dInput.maxLength = 2; dInput.inputMode = "numeric";
      function emit() { onChange(combineDateParts(yInput.value, mInput.value, dInput.value)); }
      yInput.addEventListener("input", emit); mInput.addEventListener("input", emit); dInput.addEventListener("input", emit);
      group.appendChild(yInput); group.appendChild(mInput); group.appendChild(dInput);
      wrap.appendChild(label); wrap.appendChild(group);
      return wrap;
    }

    body.appendChild(dateFieldGroup("Born (year / month / day)", draft.birthDate, (v) => { draft.birthDate = v; }));
    body.appendChild(bindText("Birthplace", "birthPlace"));
    body.appendChild(bindText("Currently residing in", "residence"));

    const deceasedWrap = document.createElement("div");
    deceasedWrap.className = "edit-checkbox-row";
    const deceasedCb = document.createElement("input");
    deceasedCb.type = "checkbox"; deceasedCb.checked = !!draft.deceased; deceasedCb.id = "edit-deceased-cb";
    const deceasedLbl = document.createElement("label");
    deceasedLbl.htmlFor = "edit-deceased-cb"; deceasedLbl.textContent = "Deceased";
    deceasedWrap.appendChild(deceasedCb); deceasedWrap.appendChild(deceasedLbl);
    body.appendChild(deceasedWrap);

    const deathDateRow = dateFieldGroup("Died (year / month / day)", draft.deathDate, (v) => { draft.deathDate = v; });
    deathDateRow.style.display = draft.deceased ? "" : "none";
    deceasedCb.addEventListener("change", () => {
      draft.deceased = deceasedCb.checked;
      deathDateRow.style.display = draft.deceased ? "" : "none";
    });
    body.appendChild(deathDateRow);

    const parentsSection = document.createElement("div");
    parentsSection.className = "modal-section";
    const parentsHeading = document.createElement("h4");
    parentsHeading.textContent = "Parents";
    parentsSection.appendChild(parentsHeading);

    const motherRow = document.createElement("div");
    motherRow.className = "edit-form-row";
    const motherLabel = document.createElement("label");
    motherLabel.textContent = "Mother";
    const motherSelect = buildPersonSelect(draft.motherId, id);
    motherSelect.addEventListener("change", () => {
      setParentRelation(id, "mother", motherSelect.value || null);
      refreshAfterEdit(`Change ${fullName(p)}'s mother`);
      closeModal();
    });
    motherRow.appendChild(motherLabel); motherRow.appendChild(motherSelect);
    parentsSection.appendChild(motherRow);

    const fatherRow = document.createElement("div");
    fatherRow.className = "edit-form-row";
    const fatherLabel = document.createElement("label");
    fatherLabel.textContent = "Father";
    const fatherSelect = buildPersonSelect(draft.fatherId, id);
    fatherSelect.addEventListener("change", () => {
      setParentRelation(id, "father", fatherSelect.value || null);
      refreshAfterEdit(`Change ${fullName(p)}'s father`);
      closeModal();
    });
    fatherRow.appendChild(fatherLabel); fatherRow.appendChild(fatherSelect);
    parentsSection.appendChild(fatherRow);
    body.appendChild(parentsSection);

    const spouseSection = document.createElement("div");
    spouseSection.className = "modal-section";
    const spouseHeading = document.createElement("h4");
    spouseHeading.textContent = "Spouse(s)";
    spouseSection.appendChild(spouseHeading);
    (p.partners || []).forEach((sp) => {
      const other = PEOPLE[sp.id];
      const row = document.createElement("div");
      row.className = "edit-relation-row";
      const label = document.createElement("span");
      label.textContent = other ? fullName(other) : "Unknown";
      const rm = document.createElement("button");
      rm.className = "rm-btn"; rm.type = "button"; rm.textContent = "Unlink";
      rm.addEventListener("click", () => {
        removeSpouseRelation(id, sp.id);
        refreshAfterEdit(`Unlink ${fullName(p)} and ${fullName(other)} as spouses`);
        closeModal();
      });
      row.appendChild(label); row.appendChild(rm);
      spouseSection.appendChild(row);
    });
    const addSpouseSelect = buildAddPersonSelect();
    addSpouseSelect.addEventListener("change", () => {
      const val = addSpouseSelect.value;
      if (!val) return;
      if (val === "__new__") {
        const newId = genId();
        PEOPLE[newId] = blankPerson(newId);
        addSpouseRelation(id, newId);
        localRefresh();
        openEditForm(newId, true);
      } else {
        addSpouseRelation(id, val);
        refreshAfterEdit(`Add ${fullName(PEOPLE[val])} as ${fullName(p)}'s spouse`);
        closeModal();
      }
    });
    spouseSection.appendChild(addSpouseSelect);
    body.appendChild(spouseSection);

    const childSection = document.createElement("div");
    childSection.className = "modal-section";
    const childHeading = document.createElement("h4");
    childHeading.textContent = "Children";
    childSection.appendChild(childHeading);
    (p.childrenIds || []).forEach((cid) => {
      const other = PEOPLE[cid];
      const row = document.createElement("div");
      row.className = "edit-relation-row";
      const label = document.createElement("span");
      label.textContent = other ? fullName(other) : "Unknown";
      const rm = document.createElement("button");
      rm.className = "rm-btn"; rm.type = "button"; rm.textContent = "Unlink";
      rm.addEventListener("click", () => {
        removeChildRelation(id, cid);
        refreshAfterEdit(`Unlink ${fullName(other)} as ${fullName(p)}'s child`);
        closeModal();
      });
      row.appendChild(label); row.appendChild(rm);
      childSection.appendChild(row);
    });
    const addChildSelect = buildAddPersonSelect();
    addChildSelect.addEventListener("change", () => {
      const val = addChildSelect.value;
      if (!val) return;
      if (val === "__new__") {
        const newId = genId();
        PEOPLE[newId] = blankPerson(newId);
        addChildRelation(id, newId);
        localRefresh();
        openEditForm(newId, true);
      } else {
        addChildRelation(id, val);
        refreshAfterEdit(`Add ${fullName(PEOPLE[val])} as ${fullName(p)}'s child`);
        closeModal();
      }
    });
    childSection.appendChild(addChildSelect);
    body.appendChild(childSection);

    const actions = document.createElement("div");
    actions.className = "edit-actions";
    const saveBtn = document.createElement("button");
    saveBtn.className = "edit-btn-primary"; saveBtn.type = "button"; saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => {
      Object.assign(p, draft);
      markDirty(id);
      refreshAfterEdit(isNew ? `Add ${fullName(p)}` : `Edit ${fullName(p)}`);
      closeModal();
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "edit-btn-secondary"; cancelBtn.type = "button"; cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      if (isNew && !p.firstName) {
        const wasFocused = state.focusId === id;
        removePerson(id);
        dirtyIds = new Map(); // this draft was never synced; discard, don't submit a phantom change
        state.history = state.history.filter((hid) => hid !== id);
        state.historyIndex = Math.min(state.historyIndex, state.history.length - 1);
        if (wasFocused) {
          state.focusId = state.history[state.historyIndex] || ROOT_ID;
          syncHash();
        }
        localRefresh();
      }
      closeModal();
    });
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    if (id !== ROOT_ID) {
      const delBtn = document.createElement("button");
      delBtn.className = "edit-btn-danger"; delBtn.type = "button"; delBtn.textContent = "Delete person";
      delBtn.addEventListener("click", () => {
        if (!confirm(`Delete ${fullName(p)}? Their children keep their own record but lose this parent link.`)) return;
        const wasFocused = state.focusId === id;
        removePerson(id);
        state.history = state.history.filter((hid) => hid !== id);
        state.historyIndex = Math.min(state.historyIndex, state.history.length - 1);
        if (wasFocused) {
          state.focusId = state.history[state.historyIndex] || ROOT_ID;
          syncHash();
        }
        refreshAfterEdit(`Delete ${fullName(p)}`);
        closeModal();
      });
      actions.appendChild(delBtn);
    }
    body.appendChild(actions);

    document.getElementById("detail-modal").classList.remove("hidden");
  }

  function openExportPanel() {
    const dataStr = JSON.stringify({ rootId: ROOT_ID, people: PEOPLE }, null, 2);
    currentModalId = null;
    document.getElementById("modal-edit").style.display = "none";
    const body = document.getElementById("modal-body");
    body.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "modal-title";
    heading.textContent = "Your data, as text";
    body.appendChild(heading);

    const note = document.createElement("div");
    note.className = "edit-note";
    note.textContent = "Copy this and send it back (e.g. paste it in chat) to have your edits published for everyone.";
    body.appendChild(note);

    const textarea = document.createElement("textarea");
    textarea.readOnly = true;
    textarea.value = dataStr;
    textarea.className = "export-textarea";
    body.appendChild(textarea);

    const copyBtn = document.createElement("button");
    copyBtn.className = "edit-btn-primary";
    copyBtn.style.marginTop = "10px";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy to clipboard";
    copyBtn.addEventListener("click", async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(dataStr); ok = true; } catch (e) {}
      if (!ok) {
        try { textarea.select(); ok = document.execCommand("copy"); } catch (e2) {}
      }
      copyBtn.textContent = ok ? "✓ Copied" : "Select the text above and copy manually";
      setTimeout(() => { copyBtn.textContent = "Copy to clipboard"; }, 2500);
    });
    body.appendChild(copyBtn);

    document.getElementById("detail-modal").classList.remove("hidden");
  }

  document.getElementById("modal-edit").addEventListener("click", () => {
    if (currentModalId) openEditForm(currentModalId, false);
  });

  document.getElementById("btn-tools").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("tools-menu").classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".tools-wrap")) document.getElementById("tools-menu").classList.add("hidden");
  });

  document.getElementById("btn-add-person").addEventListener("click", () => {
    document.getElementById("tools-menu").classList.add("hidden");
    const newId = genId();
    PEOPLE[newId] = blankPerson(newId);
    markDirty(newId);
    localRefresh();
    openEditForm(newId, true);
  });

  document.getElementById("btn-quick-add").addEventListener("click", () => {
    const contextId = PEOPLE[state.focusId] ? state.focusId : getMeId();
    const contextPerson = PEOPLE[contextId];
    const newId = genId();
    PEOPLE[newId] = blankPerson(newId);
    markDirty(newId);
    if (contextPerson) addChildRelation(contextId, newId);
    localRefresh();
    navigateTo(newId);
    openEditForm(newId, true);
  });

  document.getElementById("btn-export-data").addEventListener("click", () => {
    document.getElementById("tools-menu").classList.add("hidden");
    openExportPanel();
  });

  // ---------------- Pending changes (approvers) ----------------

  function renderPending() {
    const list = document.getElementById("pending-list");
    list.innerHTML = "";
    getDocs(collection(db, "pendingChanges")).then((snap) => {
      const pending = [];
      snap.forEach((d) => { if (d.data().status === "pending") pending.push({ id: d.id, ...d.data() }); });

      const badge = document.getElementById("pending-count-badge");
      if (pending.length) { badge.textContent = pending.length; badge.classList.remove("hidden"); }
      else badge.classList.add("hidden");

      if (!pending.length) {
        list.innerHTML = '<div class="empty-note">No pending changes to review.</div>';
        return;
      }

      pending.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      pending.forEach((change) => {
        const card = document.createElement("div");
        card.className = "pending-card";
        const summary = document.createElement("div");
        summary.className = "pending-card-summary";
        summary.textContent = change.summary || "Requested change";
        const meta = document.createElement("div");
        meta.className = "pending-card-meta";
        meta.textContent = `Submitted by ${change.submittedBy || "someone"}`;
        card.appendChild(summary);
        card.appendChild(meta);

        const affected = Object.keys(change.proposedPeople || {});
        const chipWrap = document.createElement("div");
        chipWrap.className = "modal-chip-list";
        chipWrap.style.marginBottom = "10px";
        affected.forEach((pid) => {
          const proposed = change.proposedPeople[pid];
          const chip = document.createElement("span");
          chip.className = "modal-chip";
          chip.textContent = proposed ? fullName(proposed) : `(remove ${fullName(PEOPLE[pid]) || pid})`;
          chipWrap.appendChild(chip);
        });
        card.appendChild(chipWrap);

        const actions = document.createElement("div");
        actions.className = "pending-card-actions";
        const approveBtn = document.createElement("button");
        approveBtn.className = "edit-btn-primary"; approveBtn.type = "button"; approveBtn.textContent = "Approve";
        approveBtn.addEventListener("click", async () => {
          approveBtn.disabled = true;
          try {
            const writes = affected.map((pid) => {
              const proposed = change.proposedPeople[pid];
              return proposed ? setDoc(doc(db, "people", pid), sanitizeForFirestore(proposed)) : deleteDoc(doc(db, "people", pid));
            });
            await Promise.all(writes);
            await setDoc(doc(db, "pendingChanges", change.id), { status: "approved" }, { merge: true });
            await loadPeopleFromFirestore();
            GENERATIONS = computeGenerations();
            renderPending();
          } catch (e) {
            alert("Could not approve: " + e.message);
            approveBtn.disabled = false;
          }
        });
        const rejectBtn = document.createElement("button");
        rejectBtn.className = "edit-btn-secondary"; rejectBtn.type = "button"; rejectBtn.textContent = "Reject";
        rejectBtn.addEventListener("click", async () => {
          rejectBtn.disabled = true;
          try {
            await setDoc(doc(db, "pendingChanges", change.id), { status: "rejected" }, { merge: true });
            renderPending();
          } catch (e) {
            alert("Could not reject: " + e.message);
            rejectBtn.disabled = false;
          }
        });
        actions.appendChild(approveBtn);
        actions.appendChild(rejectBtn);
        card.appendChild(actions);
        list.appendChild(card);
      });
    });
  }

  function refreshPendingBadge() {
    if (!isApprover) return;
    getDocs(collection(db, "pendingChanges")).then((snap) => {
      let count = 0;
      snap.forEach((d) => { if (d.data().status === "pending") count += 1; });
      const badge = document.getElementById("pending-count-badge");
      if (count) { badge.textContent = count; badge.classList.remove("hidden"); }
      else badge.classList.add("hidden");
    });
  }

  // ---------------- Access management (approvers) ----------------

  function openAccessModal() {
    const body = document.getElementById("access-modal-body");
    body.innerHTML = "";
    const title = document.createElement("div");
    title.className = "modal-title";
    title.textContent = "Manage approvers";
    body.appendChild(title);
    const note = document.createElement("div");
    note.className = "edit-note";
    note.textContent = `Anyone who signs in with Google can view the tree — no approval needed for that. Approvers are the people below (plus ${ADMIN_EMAIL}, the permanent owner): they can edit directly and review everyone else's suggested changes.`;
    body.appendChild(note);

    const listEl = document.createElement("div");
    body.appendChild(listEl);

    function draw(rows) {
      listEl.innerHTML = "";
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "empty-note";
        empty.textContent = "No other approvers yet.";
        listEl.appendChild(empty);
        return;
      }
      rows.forEach((r) => {
        const row = document.createElement("div");
        row.className = "access-list-row";
        const label = document.createElement("span");
        label.textContent = r.id;
        const rm = document.createElement("button");
        rm.className = "rm-btn"; rm.type = "button"; rm.textContent = "Remove";
        rm.addEventListener("click", async () => {
          if (!confirm(`Remove approver access for ${r.id}? They can still view the tree, just not edit directly or approve changes.`)) return;
          await deleteDoc(doc(db, "allowlist", r.id));
          openAccessModal();
        });
        row.appendChild(label);
        row.appendChild(rm);
        listEl.appendChild(row);
      });
    }

    getDocs(collection(db, "allowlist")).then((snap) => {
      const rows = [];
      snap.forEach((d) => { if (d.data().isApprover) rows.push({ id: d.id, ...d.data() }); });
      draw(rows);
    });

    const addRow = document.createElement("div");
    addRow.className = "access-add-row";
    const emailInput = document.createElement("input");
    emailInput.type = "text";
    emailInput.placeholder = "someone@gmail.com";
    const addBtn = document.createElement("button");
    addBtn.className = "edit-btn-primary"; addBtn.type = "button"; addBtn.textContent = "Make approver";
    addBtn.addEventListener("click", async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email || !email.includes("@")) return;
      await setDoc(doc(db, "allowlist", email), { email, isApprover: true }, { merge: true });
      emailInput.value = "";
      openAccessModal();
    });
    addRow.appendChild(emailInput);
    addRow.appendChild(addBtn);
    body.appendChild(addRow);

    document.getElementById("access-modal").classList.remove("hidden");
  }

  document.getElementById("btn-manage-access").addEventListener("click", () => {
    document.getElementById("tools-menu").classList.add("hidden");
    openAccessModal();
  });
  document.getElementById("access-modal-close").addEventListener("click", () => {
    document.getElementById("access-modal").classList.add("hidden");
  });
  document.querySelector("#access-modal .modal-backdrop").addEventListener("click", () => {
    document.getElementById("access-modal").classList.add("hidden");
  });

  // ---------------- Import starter data (admin, first run only) ----------------

  async function maybeOfferImport() {
    if (currentUserEmail !== ADMIN_EMAIL) return;
    const existing = await getDocs(collection(db, "people"));
    if (!existing.empty) return;
    if (!confirm("This family tree's database is empty. Import the starter data (family-data.json) now?")) return;
    const res = await fetch("family-data.json");
    const data = await res.json();
    const writes = Object.entries(data.people).map(([id, person]) => setDoc(doc(db, "people", id), person));
    await Promise.all(writes);
    await setDoc(doc(db, "meta", "config"), { rootId: data.rootId }, { merge: true });
    await loadPeopleFromFirestore();
    GENERATIONS = computeGenerations();
    render();
    alert("Starter data imported.");
  }

  // ---------------- Auth flow ----------------

  function showSignInScreen() {
    document.getElementById("auth-gate").classList.remove("hidden");
    document.getElementById("app-header").classList.add("hidden");
    document.getElementById("app-main").classList.add("hidden");
  }

  document.getElementById("btn-google-signin").addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/cancelled-popup-request") {
        signInWithRedirect(auth, provider);
      } else if (e.code !== "auth/popup-closed-by-user") {
        alert("Sign-in failed: " + e.message);
      }
    }
  });

  document.getElementById("btn-signout").addEventListener("click", () => {
    document.getElementById("tools-menu").classList.add("hidden");
    signOut(auth);
  });

  async function startAppFor(user) {
    currentUserEmail = user.email;

    if (user.email === ADMIN_EMAIL) {
      isApprover = true;
    } else {
      const allowDoc = await getDoc(doc(db, "allowlist", user.email));
      isApprover = allowDoc.exists() && allowDoc.data().isApprover === true;
    }

    document.getElementById("auth-gate").classList.add("hidden");
    document.getElementById("app-header").classList.remove("hidden");
    document.getElementById("app-main").classList.remove("hidden");
    updateAccountInfo();

    await maybeOfferImport();
    await loadPeopleFromFirestore();
    const metaSnap = await getDoc(doc(db, "meta", "config"));
    if (metaSnap.exists() && metaSnap.data().rootId) ROOT_ID = metaSnap.data().rootId;
    GENERATIONS = computeGenerations();
    refreshPendingBadge();

    onSnapshot(collection(db, "people"), (snap) => {
      const data = {};
      snap.forEach((d) => { data[d.id] = d.data(); });
      PEOPLE = data;
      GENERATIONS = computeGenerations();
      render();
    });
    if (isApprover) {
      onSnapshot(collection(db, "pendingChanges"), () => refreshPendingBadge());
    }

    const hashState = readHash();
    const startId = (hashState && PEOPLE[hashState.id]) ? hashState.id : ROOT_ID;
    const startView = (hashState && ["explorer", "tree", "browse", "map", "pending"].includes(hashState.view)) ? hashState.view : "explorer";

    state.history = [startId];
    state.historyIndex = 0;
    state.focusId = startId;

    setView(startView);
    updateGoToMeLabel();
  }

  onAuthStateChanged(auth, (user) => {
    if (user) startAppFor(user);
    else showSignInScreen();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
