import {
  idb_get,
  idb_set,
  idb_delete,
  idb_keys,
  idb_meta_get,
  idb_meta_set,
  idb_meta_delete,
  ensure_persistence,
  get_storage_estimate,
} from "./db";

export const max_usage_mb = 256;
export const soft_headroom_mb = 16;
export const per_file_cap_mb = 12;
export const hydrate_concurrency = 2;

export const downscale_max_w_default = 1600;
export const jpeg_quality = 0.85;

export function new_key() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export async function current_usage_mb() {
  const est = await get_storage_estimate();
  return est ? est.usage / 1024 / 1024 : 0;
}

export async function downscale_image(
  file,
  max_w = downscale_max_w_default,
  q = jpeg_quality
) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max_w / bmp.width);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  if (scale >= 1) return file;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, 0, 0, w, h);
  const is_png = file.type === "image/png";
  const mime = is_png ? "image/png" : "image/jpeg";
  const blob = await new Promise((res) =>
    canvas.toBlob(res, mime, is_png ? undefined : q)
  );
  return new File(
    [blob],
    file.name.replace(/\.(\w+)$/, "") + (is_png ? ".png" : ".jpg"),
    { type: mime }
  );
}

export async function downscale_to_fit(file, max_mb) {
  let max_w = downscale_max_w_default;
  let f = file;
  for (let i = 0; i < 6; i++) {
    if (f.size / 1024 / 1024 <= max_mb) return f;
    max_w = Math.max(640, Math.floor(max_w * 0.75));
    f = await downscale_image(f, max_w);
  }
  return f;
}

export async function evict_until_fits(target_free_mb) {
  const keys = await idb_keys();
  const entries = await Promise.all(
    keys.map(async (k) => {
      const meta = await idb_meta_get(k);
      return { k, t: meta?.last || 0, s: meta?.size || 0 };
    })
  );
  entries.sort((a, b) => a.t - b.t);
  let freed = 0;
  for (const e of entries) {
    if (freed >= target_free_mb * 1024 * 1024) break;
    await idb_delete(e.k).catch(() => {});
    await idb_meta_delete(e.k).catch(() => {});
    freed += e.s;
  }
}

export async function save_image_to_idb(file) {
  await ensure_persistence();
  let candidate = await downscale_to_fit(file, per_file_cap_mb);
  if (candidate.size / 1024 / 1024 > per_file_cap_mb)
    throw new Error("file too large");
  const usage = await current_usage_mb();
  const remaining = max_usage_mb - usage;
  const need_mb = candidate.size / 1024 / 1024 + soft_headroom_mb;
  if (remaining < need_mb) await evict_until_fits(need_mb - remaining);
  const key = new_key();
  await idb_set(key, candidate);
  await idb_meta_set(key, { size: candidate.size, last: Date.now() });
  return { key, file: candidate };
}

export function extract_keys_from_markdown(md) {
  const keys = new Set();
  const re_md = /!\[[^\]]*]\(appimg:\/\/([^)]+)\)/g;
  const re_html = /<img[^>]+src=["']appimg:\/\/([^"']+)["'][^>]*>/g;
  let m;
  while ((m = re_md.exec(md))) keys.add(m[1]);
  while ((m = re_html.exec(md))) keys.add(m[1]);
  return keys;
}

export async function gc_unused_images(current_md) {
  const used = extract_keys_from_markdown(current_md);
  const keys = await idb_keys();
  const to_delete = keys.filter((k) => !used.has(k));
  await Promise.allSettled(
    to_delete.map(async (k) => {
      await idb_delete(k);
      await idb_meta_delete(k);
    })
  );
}

const blob_url_cache = new Map();

export function revoke_all_blob_urls() {
  for (const url of blob_url_cache.values()) URL.revokeObjectURL(url);
  blob_url_cache.clear();
}

export async function hydrate_html(html) {
  if (!html.includes("appimg://")) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  const imgs = Array.from(container.querySelectorAll('img[src^="appimg://"]'));
  let index = 0;
  const worker = async () => {
    for (;;) {
      const i = index++;
      if (i >= imgs.length) break;
      const img = imgs[i];
      const key = img.getAttribute("src").slice("appimg://".length);
      try {
        const blob = await idb_get(key);
        if (blob) {
          let url = blob_url_cache.get(key);
          if (!url) {
            url = URL.createObjectURL(blob);
            blob_url_cache.set(key, url);
          }
          img.src = url;
          const old = await idb_meta_get(key);
          await idb_meta_set(key, {
            ...(old || {}),
            last: Date.now(),
            size: old?.size ?? blob.size,
          });
        } else {
          img.setAttribute(
            "alt",
            (img.getAttribute("alt") || "") + " (missing)"
          );
        }
      } catch {}
    }
  };
  const workers = Array.from(
    { length: Math.min(hydrate_concurrency, imgs.length) },
    worker
  );
  await Promise.all(workers);
  return container.innerHTML;
}
