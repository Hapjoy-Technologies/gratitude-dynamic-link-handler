// Runs in front of the static assets for every request.
//
// Two jobs. It returns 200 for short-link paths, which the static file server
// cannot do because no file exists at /AttractMoneyAffirmations. And it injects
// that link's own Open Graph tags into the HTML, which matters because crawlers
// do not run the page's JavaScript and would otherwise see one generic card for
// every link.

const OG_INDEX =
  "https://static.gratefulness.me/gratitude-static-content/v1/affn/og-index.json";
const INDEX_TTL_SECONDS = 300;

const DEFAULTS = {
  title: "Gratitude | A tool to help you improve your long-term well-being.",
  description:
    "Write journal entries for your gratitude journal, construct self-affirmations, receive daily quotes, and build a vision board that consists of images and goals.",
  image:
    "https://static.gratefulness.me/gratitude-app-content/metadata/og-default.jpg",
};

const escapeAttr = (value) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Closing-tag sequences inside an inline script would end the block early.
const safeJson = (value) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");

async function loadIndex() {
  try {
    const response = await fetch(OG_INDEX, {
      cf: { cacheTtl: INDEX_TTL_SECONDS, cacheEverything: true },
    });
    if (!response.ok) return null;
    return (await response.json()).links || null;
  } catch {
    return null;
  }
}

function buildHead(entry, pageUrl) {
  const title = entry?.title || DEFAULTS.title;
  const description = entry?.description || DEFAULTS.description;
  const image = entry?.image || DEFAULTS.image;

  return `<title>${escapeAttr(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Gratitude" />
  <meta property="og:url" content="${escapeAttr(pageUrl)}" />
  <meta property="og:title" content="${escapeAttr(title)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:image" content="${escapeAttr(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(title)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  <meta name="twitter:image" content="${escapeAttr(image)}" />`;
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const code = url.pathname.replace(/^\/+|\/+$/g, "");

  // Root and real files (anything with an extension) are served as-is.
  if (!code || code.includes(".") || code.includes("/")) return next();

  const assetResponse = await env.ASSETS.fetch(new URL("/", url));
  if (!assetResponse.ok) return next();
  let html = await assetResponse.text();

  const index = await loadIndex();
  const entry = index ? index[code] : null;

  // Strip the page's static tags before adding this link's own.
  html = html
    .replace(/<meta\s+property="og:(?:title|image|description)"[^>]*>/gi, "")
    .replace(/<title>[\s\S]*?<\/title>/i, "");

  let head = buildHead(entry, url.toString());
  if (entry?.url) {
    // Lets the page skip its own resolve round trip to the API.
    head += `\n  <script>window.__GRATITUDE_LINK__ = ${safeJson({ longUrl: entry.url })};</script>`;
  }
  html = html.replace(/<\/head>/i, `  ${head}\n</head>`);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Short, so a newly minted link starts unfurling correctly quickly.
      "cache-control": "public, max-age=300",
    },
  });
}
