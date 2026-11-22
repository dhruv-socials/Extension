const $ = (id) => document.getElementById(id);
const form = $("form"), urlEl = $("url"), nameEl = $("name"), noteEl = $("note");
const saveBtn = $("save"), cancelBtn = $("cancel"), errorEl = $("error");
const listEl = $("list"), emptyEl = $("empty"), searchEl = $("search");

let items = [];
let editingId = null;

async function load() {
  try {
    const data = await chrome.storage.sync.get("items");
    items = data.items || [];
  } catch (e) {
    items = [];
  }
  render();
  urlEl.focus();
}

async function persist() {
  try {
    await chrome.storage.sync.set({ items });
  } catch (e) {
    showError("Could not save. Storage may be full.");
  }
}

function normalizeUrl(raw) {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  try {
    const u = new URL(value);
    if (!u.hostname.includes(".")) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

function hostOf(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

function defaultName(url) {
  const part = hostOf(url).split(".")[0];
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function faviconFor(url) {
  return "https://www.google.com/s2/favicons?sz=64&domain=" + encodeURIComponent(hostOf(url));
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
}

function resetForm() {
  editingId = null;
  form.reset();
  saveBtn.textContent = "Add platform";
  cancelBtn.hidden = true;
  showError("");
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const shown = items.filter((it) =>
    !q || (it.name + " " + it.note + " " + it.url).toLowerCase().includes(q)
  );
  listEl.replaceChildren();
  searchEl.hidden = items.length < 6;
  emptyEl.hidden = items.length > 0;

  for (const it of shown) {
    const li = document.createElement("li");
    li.className = "item";

    const main = document.createElement("button");
    main.type = "button";
    main.className = "item-main";
    main.title = "Open " + hostOf(it.url);
    main.addEventListener("click", () => chrome.tabs.create({ url: it.url }));

    const img = document.createElement("img");
    img.className = "logo";
    img.alt = "";
    img.src = faviconFor(it.url);
    img.addEventListener("error", () => {
      const fb = document.createElement("div");
      fb.className = "logo-fallback";
      fb.textContent = it.name.charAt(0).toUpperCase();
      img.replaceWith(fb);
    });

    const text = document.createElement("div");
    text.className = "text";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = it.name;
    const host = document.createElement("div");
    host.className = "host";
    host.textContent = hostOf(it.url);
    text.append(title, host);
    if (it.note) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = it.note;
      text.append(note);
    }
    main.append(img, text);

    const tools = document.createElement("div");
    tools.className = "tools";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => startEdit(it.id));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.addEventListener("click", () => remove(it.id));
    tools.append(edit, del);

    li.append(main, tools);
    listEl.append(li);
  }
}

function startEdit(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  editingId = id;
  urlEl.value = it.url;
  nameEl.value = it.name;
  noteEl.value = it.note;
  saveBtn.textContent = "Save changes";
  cancelBtn.hidden = false;
  noteEl.focus();
  window.scrollTo({ top: 0 });
}

async function remove(id) {
  items = items.filter((x) => x.id !== id);
  if (editingId === id) resetForm();
  await persist();
  render();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = normalizeUrl(urlEl.value);
  if (!url) {
    showError("Enter a valid link, for example naukri.com or https://www.linkedin.com/jobs.");
    return;
  }
  showError("");
  const name = nameEl.value.trim() || defaultName(url);
  const note = noteEl.value.trim();

  if (editingId) {
    items = items.map((x) => (x.id === editingId ? { ...x, url, name, note } : x));
  } else {
    items.unshift({ id: crypto.randomUUID(), url, name, note });
  }
  await persist();
  resetForm();
  render();
});

cancelBtn.addEventListener("click", resetForm);
searchEl.addEventListener("input", render);

$("useTab").addEventListener("click", async () => {
  let last = null;
  try {
    last = (await chrome.storage.session.get("lastTab")).lastTab;
  } catch (e) {}
  if (last && last.url) {
    urlEl.value = last.url;
    if (!nameEl.value && last.title) nameEl.value = last.title.slice(0, 40);
    noteEl.focus();
    showError("");
  } else {
    showError("No earlier page found. Click the extension icon while on the site you want to add.");
  }
});

load();
