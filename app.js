const $ = (id) => document.getElementById(id);
const form = $("form"), dlg = $("dlg"), urlEl = $("url"), nameEl = $("name"), tagEl = $("tag"), noteEl = $("note");
const errorEl = $("error"), listEl = $("list"), emptyEl = $("empty"), searchEl = $("search"), chipsEl = $("chips");

let items = [];      // saved in Chrome sync (text only, small)
let logos = {};      // saved in local storage: { "naukri.com": "data:image/png;base64,..." }
let editingId = null;
let tagFilter = "";
const tried = new Set();

async function load() {
  try {
    const s = await chrome.storage.sync.get("items");
    items = s.items || [];
    const l = await chrome.storage.local.get("logos");
    logos = l.logos || {};
  } catch (e) {}
  render();
  ensureLogos();
}

async function persist() {
  try { await chrome.storage.sync.set({ items }); }
  catch (e) { showError("Could not save. Storage may be full."); }
}

function normalizeUrl(raw) {
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try {
    const u = new URL(v);
    return u.hostname.includes(".") ? u.href : null;
  } catch (e) { return null; }
}
const hostOf = (url) => new URL(url).hostname.replace(/^www\./, "");
const defaultName = (url) => { const p = hostOf(url).split(".")[0]; return p.charAt(0).toUpperCase() + p.slice(1); };
const showError = (m) => { errorEl.textContent = m; errorEl.hidden = !m; };

// Logos: fetched once, stored as a small image in local storage, then reused.
async function fetchLogo(host) {
  try {
    const r = await fetch("https://www.google.com/s2/favicons?sz=64&domain=" + encodeURIComponent(host));
    if (!r.ok) return null;
    const b = await r.blob();
    if (!b.size) return null;
    return await new Promise((res, rej) => {
      const f = new FileReader();
      f.onload = () => res(f.result);
      f.onerror = rej;
      f.readAsDataURL(b);
    });
  } catch (e) { return null; }
}

async function ensureLogos() {
  const missing = [...new Set(items.map((i) => hostOf(i.url)))].filter((h) => !logos[h] && !tried.has(h));
  if (!missing.length) return;
  missing.forEach((h) => tried.add(h));
  const results = await Promise.all(missing.map(fetchLogo));
  let changed = false;
  missing.forEach((h, i) => { if (results[i]) { logos[h] = results[i]; changed = true; } });
  if (changed) {
    try { await chrome.storage.local.set({ logos }); } catch (e) {}
    render();
  }
}

function tileFor(it) {
  const d = document.createElement("div");
  d.className = "logo-fallback";
  let h = 0;
  for (const c of hostOf(it.url)) h = (h * 31 + c.charCodeAt(0)) % 360;
  d.style.background = `hsl(${h} 50% 42%)`;
  d.textContent = it.name.charAt(0).toUpperCase();
  return d;
}

function render() {
  const tags = [...new Set(items.map((i) => i.tag).filter(Boolean))].sort();
  if (tagFilter && !tags.includes(tagFilter)) tagFilter = "";
  chipsEl.replaceChildren();
  if (tags.length) {
    for (const t of ["", ...tags]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = t || "All";
      b.setAttribute("aria-pressed", String(t === tagFilter));
      b.addEventListener("click", () => { tagFilter = t; render(); });
      chipsEl.append(b);
    }
  }
  const dl = $("tags");
  dl.replaceChildren(...tags.map((t) => Object.assign(document.createElement("option"), { value: t })));

  const q = searchEl.value.trim().toLowerCase();
  const shown = items.filter((it) =>
    (!tagFilter || it.tag === tagFilter) &&
    (!q || [it.name, it.note, it.tag, it.url].join(" ").toLowerCase().includes(q))
  );
  emptyEl.hidden = items.length > 0;
  listEl.replaceChildren();

  for (const it of shown) {
    const host = hostOf(it.url);
    const li = document.createElement("li");
    li.className = "item";

    const main = document.createElement("button");
    main.type = "button";
    main.className = "item-main";
    main.title = "Open " + host;
    main.addEventListener("click", () => chrome.tabs.create({ url: it.url }));

    let icon;
    if (logos[host]) {
      icon = document.createElement("img");
      icon.className = "logo";
      icon.alt = "";
      icon.src = logos[host];
    } else icon = tileFor(it);

    const text = document.createElement("div");
    text.className = "text";
    const title = Object.assign(document.createElement("div"), { className: "title", textContent: it.name });
    const hostEl = Object.assign(document.createElement("div"), { className: "host", textContent: host });
    text.append(title, hostEl);
    if (it.tag) text.append(Object.assign(document.createElement("span"), { className: "tag", textContent: it.tag }));
    if (it.note) text.append(Object.assign(document.createElement("div"), { className: "note", textContent: it.note }));
    main.append(icon, text);

    const tools = document.createElement("div");
    tools.className = "tools";
    const edit = Object.assign(document.createElement("button"), { type: "button", textContent: "Edit" });
    edit.addEventListener("click", () => openDialog(it));
    const del = Object.assign(document.createElement("button"), { type: "button", className: "del", textContent: "Delete" });
    del.addEventListener("click", () => remove(it.id));
    tools.append(edit, del);

    li.append(main, tools);
    listEl.append(li);
  }
}

function openDialog(it) {
  editingId = it ? it.id : null;
  form.reset();
  showError("");
  $("dlgTitle").textContent = it ? "Edit platform" : "Add platform";
  $("save").textContent = it ? "Save changes" : "Add platform";
  if (it) { urlEl.value = it.url; nameEl.value = it.name; tagEl.value = it.tag || ""; noteEl.value = it.note || ""; }
  dlg.showModal();
  urlEl.focus();
}

async function remove(id) {
  items = items.filter((x) => x.id !== id);
  await persist();
  render();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = normalizeUrl(urlEl.value);
  if (!url) { showError("Enter a valid link, for example naukri.com or https://www.linkedin.com/jobs."); return; }
  const rec = { url, name: nameEl.value.trim() || defaultName(url), tag: tagEl.value.trim(), note: noteEl.value.trim() };
  if (editingId) items = items.map((x) => (x.id === editingId ? { ...x, ...rec } : x));
  else items.unshift({ id: crypto.randomUUID(), ...rec });
  await persist();
  dlg.close();
  render();
  ensureLogos();
});

$("add").addEventListener("click", () => openDialog(null));
$("cancel").addEventListener("click", () => dlg.close());
searchEl.addEventListener("input", render);

$("useTab").addEventListener("click", async () => {
  let last = null;
  try { last = (await chrome.storage.session.get("lastTab")).lastTab; } catch (e) {}
  if (last && last.url) {
    urlEl.value = last.url;
    if (!nameEl.value && last.title) nameEl.value = last.title.slice(0, 40);
    showError("");
  } else showError("No earlier page found. Click the extension icon while on the site you want to add.");
});

// Backup: export / import as a JSON file (logos are re-fetched automatically).
$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ items }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "job-links-backup.json" });
  a.click();
  URL.revokeObjectURL(a.href);
});
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const have = new Set(items.map((i) => i.url));
    let added = 0;
    for (const r of data.items || []) {
      const url = normalizeUrl(String(r.url || ""));
      if (!url || have.has(url)) continue;
      items.push({ id: crypto.randomUUID(), url, name: String(r.name || defaultName(url)), tag: String(r.tag || ""), note: String(r.note || "") });
      have.add(url);
      added++;
    }
    await persist();
    render();
    ensureLogos();
    alert(added + " platform(s) imported.");
  } catch (err) { alert("That file could not be read."); }
});

load();
