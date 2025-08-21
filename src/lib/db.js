export const db_name = "zine";
export const db_ver = 2;
export const store_name = "images";
export const meta_store_name = "images_meta";

export function open_db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(db_name, db_ver);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store_name))
        db.createObjectStore(store_name);
      if (!db.objectStoreNames.contains(meta_store_name))
        db.createObjectStore(meta_store_name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idb_get(key) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store_name, "readonly");
    const st = tx.objectStore(store_name);
    const rq = st.get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

export async function idb_set(key, value) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store_name, "readwrite");
    const st = tx.objectStore(store_name);
    const rq = st.put(value, key);
    rq.onsuccess = () => resolve(true);
    rq.onerror = () => reject(rq.error);
  });
}

export async function idb_delete(key) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store_name, "readwrite");
    const st = tx.objectStore(store_name);
    const rq = st.delete(key);
    rq.onsuccess = () => resolve(true);
    rq.onerror = () => reject(rq.error);
  });
}

export async function idb_keys() {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store_name, "readonly");
    const st = tx.objectStore(store_name);
    const keys = [];
    const rq = st.openCursor();
    rq.onsuccess = () => {
      const cur = rq.result;
      if (cur) {
        keys.push(cur.key);
        cur.continue();
      } else resolve(keys);
    };
    rq.onerror = () => reject(rq.error);
  });
}

export async function idb_meta_get(key) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(meta_store_name, "readonly");
    const st = tx.objectStore(meta_store_name);
    const rq = st.get(key);
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => reject(rq.error);
  });
}

export async function idb_meta_set(key, value) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(meta_store_name, "readwrite");
    const st = tx.objectStore(meta_store_name);
    const rq = st.put(value, key);
    rq.onsuccess = () => resolve(true);
    rq.onerror = () => reject(rq.error);
  });
}

export async function idb_meta_delete(key) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(meta_store_name, "readwrite");
    const st = tx.objectStore(meta_store_name);
    const rq = st.delete(key);
    rq.onsuccess = () => resolve(true);
    rq.onerror = () => reject(rq.error);
  });
}

export async function get_storage_estimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return { quota, usage };
  } catch {
    return null;
  }
}

export async function ensure_persistence() {
  if (navigator.storage?.persist) {
    try {
      await navigator.storage.persist();
    } catch {}
  }
}
