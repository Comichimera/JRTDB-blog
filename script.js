// Settings
const POSTS_DIR = "posts";
const INDEX_FILE = "postindex.txt";

// Boot
document.addEventListener("DOMContentLoaded", () => {
  loadPostsList()
    .then(renderAll)
    .catch(showError)
    .finally(() => hide("#loading"));
});

// Load & parse
async function loadPostsList() {
  const indexUrl = `${POSTS_DIR}/${INDEX_FILE}`;
  const text = await fetchText(indexUrl);
  const files = text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#")); // allow comments

  const posts = [];
  for (const filename of files) {
    const url = `${POSTS_DIR}/${filename}`;
    try {
      const txt = await fetchText(url);
      posts.push(parsePost(txt, filename));
    } catch (e) {
      console.warn("Failed to load", filename, e);
      posts.push({
        title: filename,
        meta: { written:"", edited:"", author:"", readtime:"" },
        excerpt: "Failed to load this post.",
        contentNodes: [makeParagraph("Couldn’t fetch this post file.")],
        error: true
      });
    }
  }
  return posts;
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Post format parser

// Header (any order, case-insensitive):
// title: First Post!
// previewtext: This is the first post. click to read more...
// written: 09 Aug, 2025
// edited: 09 Aug, 2025
// author: Freya
// readtime: 2 mins
//
// content:
// (body text)
function parsePost(raw, filename) {
  const lines = raw.replace(/\r/g, "").split("\n");
  const meta = {};
  let i = 0;

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty header lines
    if (/^content\s*:\s*$/i.test(line)) { i++; break; }
    const m = line.match(/^([a-zA-Z]+)\s*:\s*(.*)$/);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      meta[key] = val;
    } // non key:value lines are ignored until "content:"
  }

  // Remainder = body
  let body = lines.slice(i).join("\n").trim();

  // Title: prefer header -> fallback to first line of body
  let title = (meta.title || "").trim();
  if (!title) title = deriveTitle(body, filename);

  // If the first non-empty body line equals the title, remove it to avoid duplication
  if (meta.title) {
    const arr = body.split("\n");
    let firstIdx = -1;
    for (let j = 0; j < arr.length; j++) {
      if (arr[j].trim().length) { firstIdx = j; break; }
    }
    if (firstIdx !== -1) {
      const candidate = arr[firstIdx].replace(/^#+\s*/, "").trim();
      if (candidate === meta.title.trim()) {
        arr.splice(firstIdx, 1);
        body = arr.join("\n").replace(/^\s*\n/, "").trim();
      }
    }
  }

  // Excerpt/preview: prefer header previewtext -> fallback to first paragraph
  const contentNodes = buildContentNodes(body);
  const excerpt = meta.previewtext && meta.previewtext.trim()
    ? meta.previewtext.trim()
    : getTextFromNodes(buildContentNodes(body, 1)).slice(0, 160) + (getTextFromNodes(buildContentNodes(body, 1)).length > 160 ? "…" : "");

  return { title, meta, excerpt, contentNodes };
}

function deriveTitle(body, filename) {
  const lines = body.split("\n");
  for (const l of lines) {
    const s = l.trim();
    if (s.length) return s.replace(/^#+\s*/, "");
    if (!s.length) break;
  }
  return filename.replace(/\.[^/.]+$/, "");
}

function buildContentNodes(body, limitParagraphs = Infinity) {
  const blocks = body
    .split(/\n\s*\n/g)           // blank line = new paragraph
    .map(b => b.replace(/\s+$/g, ""))
    .filter(b => b.trim().length > 0);

  const nodes = [];
  for (let idx = 0; idx < blocks.length && idx < limitParagraphs; idx++) {
    nodes.push(makeParagraphWithLineBreaks(blocks[idx]));
  }
  return nodes;
}

function makeParagraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function makeParagraphWithLineBreaks(text) {
  const p = document.createElement("p");
  const parts = text.split("\n"); // single newline -> <br>
  parts.forEach((seg, i) => {
    p.appendChild(document.createTextNode(seg));
    if (i < parts.length - 1) p.appendChild(document.createElement("br"));
  });
  return p;
}

function getTextFromNodes(nodes) {
  const div = document.createElement("div");
  nodes.forEach(n => div.appendChild(n.cloneNode(true)));
  return div.textContent || "";
}

// Render
function renderAll(posts) {
  const host = qs("#posts");
  if (!host) return;
  host.innerHTML = "";

  posts.forEach((post) => {
    const card = renderCard(post);
    host.appendChild(card);
  });
}

function renderCard(post) {
  const card = el("article", { class: "post-card", tabindex: "0", "aria-expanded": "false" });

  const headerBtn = el("div", { class: "post-header", role: "button" });
  headerBtn.addEventListener("click", () => toggleCard(card));
  headerBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCard(card); }
  });

  const titleEl = el("h2", { class: "post-title" }, post.title);
  const metaEl = el("p", { class: "post-meta" }, buildMeta(post.meta));
  const excerptEl = el("p", { class: "post-excerpt" }, post.excerpt);

  headerBtn.appendChild(titleEl);
  headerBtn.appendChild(metaEl);

  const content = el("div", { class: "post-content", "aria-hidden": "true" });
  post.contentNodes.forEach(n => content.appendChild(n));

  card.appendChild(headerBtn);
  card.appendChild(excerptEl);
  card.appendChild(content);
  return card;
}

function toggleCard(card) {
  const expanded = card.getAttribute("aria-expanded") === "true";
  const next = !expanded;
  card.setAttribute("aria-expanded", next ? "true" : "false");
  const content = card.querySelector(".post-content");
  if (content) content.setAttribute("aria-hidden", next ? "false" : "true");
}

function buildMeta(meta) {
  const parts = [];
  if (meta.written) parts.push(`Posted ${meta.written}`);
  if (meta.edited && meta.edited !== meta.written) parts.push(`Updated ${meta.edited}`);
  if (meta.author) parts.push(`by ${meta.author}`);
  if (meta.readtime) parts.push(`· ${meta.readtime}`);
  return parts.join(" ");
}

// DOM helpers & UX
function qs(sel) { return document.querySelector(sel); }
function hide(sel) { const n = qs(sel); if (n) n.hidden = true; }
function showError(err) {
  console.error(err);
  const n = qs("#error");
  if (n) { n.hidden = false; n.textContent = "Couldn’t load posts index."; }
}
function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.appendChild(document.createTextNode(text));
  return node;
}
