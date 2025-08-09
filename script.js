// ---- Settings (adjust if you change folder names) ----
const POSTS_DIR = "posts";
const INDEX_FILE = "postindex.txt";

// ---- Boot ----
document.addEventListener("DOMContentLoaded", () => {
  loadPostsList()
    .then(renderAll)
    .catch(showError)
    .finally(() => hide("#loading"));
});

// ---- Load & parse ----
async function loadPostsList() {
  const indexUrl = `${POSTS_DIR}/${INDEX_FILE}`;
  const text = await fetchText(indexUrl);
  // Allow blank lines and comments (# …)
  const files = text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));
  // Fetch posts in this explicit order
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

// ---- Post format parser ----
// Expected .txt format:
// written: 09 Aug, 2025
// edited:  09 Aug, 2025
// author:  Freya
// readtime: 2 mins
//
// content:
// Paragraph text...
// (blank line = new paragraph)
// Single newline = line break within paragraph.
function parsePost(raw, filename) {
  const lines = raw.replace(/\r/g, "").split("\n");
  const meta = {};
  let i = 0;

  // Read header lines until we find "content:" (case-insensitive) or hit a blank line
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty header lines
    if (/^content\s*:\s*$/i.test(line)) { i++; break; }
    const m = line.match(/^([a-zA-Z]+)\s*:\s*(.*)$/);
    if (m) {
      meta[m[1].toLowerCase()] = m[2].trim();
    } else {
      // Not a key: value; treat as unexpected and continue
    }
  }

  // The remainder is the content body
  const body = lines.slice(i).join("\n").trim();

  // Title heuristic: first non-empty line of body, else filename
  const title = deriveTitle(body, filename);

  // Build content nodes: paragraphs split by blank lines; single newline => <br>
  const contentNodes = buildContentNodes(body);

  // Excerpt: first 160 chars of the first paragraph (plain text)
  const firstParaText = getTextFromNodes(buildContentNodes(body, 1));
  const excerpt = (firstParaText.length > 160)
    ? firstParaText.slice(0, 157) + "…"
    : firstParaText || "(No preview)";

  return { title, meta, excerpt, contentNodes };
}

function deriveTitle(body, filename) {
  // Take the first non-empty line before the first blank line as a possible title
  const lines = body.split("\n");
  for (const l of lines) {
    const s = l.trim();
    if (s.length) {
      // If it looks like a heading marker, strip it
      return s.replace(/^#+\s*/, "");
    }
    if (!s.length) break;
  }
  return filename.replace(/\.[^/.]+$/, "");
}

function buildContentNodes(body, limitParagraphs = Infinity) {
  const blocks = body
    // Split by two or more newlines (blank line = paragraph break)
    .split(/\n\s*\n/g)
    .map(b => b.replace(/\s+$/g, "")) // trim right
    .filter(b => b.trim().length > 0);

  const nodes = [];
  for (let idx = 0; idx < blocks.length && idx < limitParagraphs; idx++) {
    const para = blocks[idx];
    nodes.push(makeParagraphWithLineBreaks(para));
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
  // single newline => <br>
  const parts = text.split("\n");
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
  host.innerHTML = "";

  posts.forEach((post, idx) => {
    const card = renderCard(post, idx);
    host.appendChild(card);
  });
}

function renderCard(post, idx) {
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