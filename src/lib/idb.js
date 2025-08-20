export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("zine-db", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("assets"))
        db.createObjectStore("assets");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readonly");
    const store = tx.objectStore("assets");
    const req = store.getAllKeys();
    req.onsuccess = async () => {
      const keys = req.result || [];
      const out = {};
      await Promise.all(
        keys.map(
          (k) =>
            new Promise((res, rej) => {
              const r = store.get(k);
              r.onsuccess = () => {
                out[k] = r.result;
                res();
              };
              r.onerror = () => rej(r.error);
            })
        )
      );
      resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}
