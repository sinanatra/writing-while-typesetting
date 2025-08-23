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

const DB_NAME = "zine-images";
const STORE_NAME = "images";

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

async function open_images_db() {
  return await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function read_image_blob(key) {
  const db = await open_images_db();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const st = tx.objectStore(STORE_NAME);
    const get = st.get(key);
    get.onsuccess = () => {
      const val = get.result;
      if (!val) return resolve(null);
      if (val instanceof Blob)
        return resolve({ blob: val, name: key, type: val.type || "image/*" });
      if (val && val.blob)
        return resolve({
          blob: val.blob,
          name: val.name || key,
          type: val.type || val.blob?.type || "image/*",
        });
      resolve(null);
    };
    get.onerror = () => reject(get.error);
  });
}

export async function write_image_blob(
  key,
  blob,
  name = key,
  type = blob?.type || "image/*"
) {
  const db = await open_images_db();
  const payload = { blob, name, type };
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const st = tx.objectStore(STORE_NAME);
    const put = st.put(payload, key);
    put.onsuccess = () => resolve(true);
    put.onerror = () => reject(put.error);
  });
}

export function extract_appimg_keys(text = "") {
  const keys = new Set();
  const re = /appimg:\/\/([A-Za-z0-9._\-:/]+)/g;
  let m;
  while ((m = re.exec(String(text)))) {
    keys.add(m[1]);
  }
  return Array.from(keys);
}

export function blob_to_base64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result || "");
      const idx = res.indexOf("base64,");
      resolve(idx >= 0 ? res.slice(idx + 7) : res);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function export_images_for_markdown(markdown) {
  const map = {};
  const keys = extract_appimg_keys(markdown);
  for (const key of keys) {
    const blob = await idb_get(key);
    if (!blob) continue;
    const b64 = await blob_to_base64(blob);
    map[key] = {
      name: key,
      type: blob.type || "image/*",
      base64: b64,
    };
  }
  return map;
}

export async function import_images_from_map(assets = {}) {
  const entries = Object.entries(assets);
  for (const [key, meta] of entries) {
    const b64 = meta?.base64;
    if (!b64) continue;
    const mime = meta?.type || "image/*";
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], { type: mime });

    await idb_set(key, blob);
    await idb_meta_set(key, { size: blob.size, last: Date.now() });
  }
}
