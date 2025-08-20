<script>
  import { onMount, onDestroy, tick } from "svelte";
  import { page_sizes, px_per_mm } from "./lib/formats";
  import { preprocessMarkdown } from "./lib/markers";
  import { paginate } from "./lib/paginate";

  const db_name = "zine";
  const db_ver = 1;
  const store_name = "images";

  function open_db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(db_name, db_ver);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(store_name)) {
          db.createObjectStore(store_name);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idb_get(key) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store_name, "readonly");
      const st = tx.objectStore(store_name);
      const rq = st.get(key);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }

  async function idb_set(key, value) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store_name, "readwrite");
      const st = tx.objectStore(store_name);
      const rq = st.put(value, key);
      rq.onsuccess = () => resolve(true);
      rq.onerror = () => reject(rq.error);
    });
  }

  async function idb_delete(key) {
    const db = await open_db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store_name, "readwrite");
      const st = tx.objectStore(store_name);
      const rq = st.delete(key);
      rq.onsuccess = () => resolve(true);
      rq.onerror = () => reject(rq.error);
    });
  }

  async function idb_keys() {
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

  async function get_storage_estimate() {
    if (!navigator.storage?.estimate) return null;
    try {
      const { quota, usage } = await navigator.storage.estimate();
      return { quota, usage };
    } catch {
      return null;
    }
  }

  const downscale_max_w = 1600;
  const jpeg_quality = 0.85;

  async function downscale_image(
    file,
    max_w = downscale_max_w,
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

  const new_key = () => `${Date.now()}-${crypto.randomUUID()}`;

  async function save_image_to_idb(file) {
    const small = await downscale_image(file);
    const key = new_key();
    await idb_set(key, small);
    return { key, file: small };
  }

  function insert_ref_for_key(file_name, key) {
    insert_at_cursor(`\n\n![${file_name}](appimg://${key})\n\n`);
  }

  function extract_keys_from_markdown(md) {
    const keys = new Set();
    const re = /!\[[^\]]*]\(appimg:\/\/([^)]+)\)/g;
    let m;
    while ((m = re.exec(md))) keys.add(m[1]);
    return keys;
  }

  async function gc_unused_images(current_md) {
    const used = extract_keys_from_markdown(current_md);
    const keys = await idb_keys();
    const to_delete = keys.filter((k) => !used.has(k));
    await Promise.allSettled(to_delete.map(idb_delete));
  }

  const blob_url_cache = new Map();

  function revoke_all_blob_urls() {
    for (const url of blob_url_cache.values()) URL.revokeObjectURL(url);
    blob_url_cache.clear();
  }

  async function hydrate_html(html) {
    if (!html.includes("appimg://")) return html;

    const container = document.createElement("div");
    container.innerHTML = html;

    const imgs = Array.from(
      container.querySelectorAll('img[src^="appimg://"]')
    );
    const tasks = imgs.map(async (img) => {
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
        } else {
          img.setAttribute(
            "alt",
            (img.getAttribute("alt") || "") + " (missing)"
          );
        }
      } catch (e) {
        console.warn("hydrate failed", key, e);
      }
    });

    await Promise.all(tasks);
    return container.innerHTML;
  }

  const default_md = `
  ## A New Chapter
  [[pagebreak]]
  Donec sodales elit ut ullamcorper laoreet...
  `;

  let title = localStorage.getItem("zine:title") ?? "Untitled Zine";
  let page_size = localStorage.getItem("zine:page_size") ?? "A7";
  let margins = JSON.parse(
    localStorage.getItem("zine:margins") ??
      JSON.stringify(page_sizes.A5.margins)
  );
  let markdown = localStorage.getItem("zine:markdown") ?? default_md;

  let columns = Number(localStorage.getItem("zine:columns") ?? 1);
  let column_gap = Number(localStorage.getItem("zine:column_gap") ?? 5);

  let font_family =
    localStorage.getItem("zine:font_family") ?? "Courier, monospace";
  let base_font_pt = Number(localStorage.getItem("zine:base_font_pt") ?? 11);
  let line_height = Number(localStorage.getItem("zine:line_height") ?? 1.5);
  let justify = localStorage.getItem("zine:justify") ?? "left";
  let hyphens = localStorage.getItem("zine:hyphens") ?? "auto";

  let print_mode = localStorage.getItem("zine:print_mode") ?? "pages";
  let spread_gutter = Number(localStorage.getItem("zine:spread_gutter") ?? 6);

  $: localStorage.setItem("zine:title", title);
  $: localStorage.setItem("zine:page_size", page_size);
  $: localStorage.setItem("zine:margins", JSON.stringify(margins));
  $: localStorage.setItem("zine:markdown", markdown);
  $: localStorage.setItem("zine:columns", String(columns));
  $: localStorage.setItem("zine:column_gap", String(column_gap));
  $: localStorage.setItem("zine:font_family", font_family);
  $: localStorage.setItem("zine:base_font_pt", String(base_font_pt));
  $: localStorage.setItem("zine:line_height", String(line_height));
  $: localStorage.setItem("zine:justify", justify);
  $: localStorage.setItem("zine:hyphens", hyphens);
  $: localStorage.setItem("zine:print_mode", print_mode);
  $: localStorage.setItem("zine:spread_gutter", String(spread_gutter));

  $: size = page_sizes[page_size] ?? page_sizes.A5;
  $: page_px = {
    w: Math.round(size.w * px_per_mm),
    h: Math.round(size.h * px_per_mm),
  };
  $: pad = {
    top: Math.round(margins.top * px_per_mm),
    right: Math.round(margins.right * px_per_mm),
    bottom: Math.round(margins.bottom * px_per_mm),
    left: Math.round(margins.left * px_per_mm),
  };

  const pt_to_px = 96 / 72;
  $: base_font_px = Math.round(base_font_pt * pt_to_px * 100) / 100;

  $: text_style = `
    font-family:${font_family};
    font-size:${base_font_px}px;
    line-height:${line_height};
    text-align:${justify === "justify" ? "justify" : "left"};
    hyphens:${hyphens};
  `;

  $: page_style = `width:${page_px.w}px;height:${page_px.h}px;--margin-bottom:${margins.bottom}`;
  $: inner_style = `
    padding:${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px;
    column-count:${columns}; column-gap:${column_gap}mm;
    ${text_style}
  `;
  $: measurer_style = `
    position:absolute; left:-99999px; top:0; opacity:0; pointer-events:none;
    width:${page_px.w - (pad.left + pad.right)}px;
    ${text_style}
  `;

  $: full_content_html = preprocessMarkdown(markdown);
  let hydrated_html = "";

  let pages = [];
  let sheets = [];
  let measurer_el;

  
  function inject_print_css() {
    const s = page_sizes[page_size] ?? page_sizes.A5;
    const mm = (n) => `${n}mm`;
    const sheet_w = print_mode === "spreads" ? s.w * 2 + spread_gutter : s.w;
    const sheet_h = s.h;

    const css = `
@page { size: ${mm(sheet_w)} ${mm(sheet_h)}; margin: 0; }

@media print {
  body { background: #fff !important; }

  .topbar,
  .workspace .left,
  .workspace .splitter,
  .right .spreads { display: none !important; }

  #print-root { display: block !important; }

  #print-root .print-page {
    width: ${mm(s.w)};
    height: ${mm(s.h)};
    background: #fff;
    box-shadow: none !important;
    page-break-after: always;
  }
  #print-root .print-page:last-child { page-break-after: auto; }

  #print-root .print-sheet {
    display: flex;
    align-items: stretch;
    width: ${mm(sheet_w)};
    height: ${mm(sheet_h)};
    page-break-after: always;
    background: #fff;
  }
  #print-root .print-sheet:last-child { page-break-after: auto; }
  #print-root .print-gutter { width: ${mm(spread_gutter)}; flex: 0 0 ${mm(spread_gutter)}; }

  #print-root .print-inner {
    box-sizing: border-box;
    width: 100%; height: 100%; overflow: hidden;
    padding: ${mm(margins.top)} ${mm(margins.right)} ${mm(margins.bottom)} ${mm(margins.left)};
    column-count: ${columns}; column-gap: ${mm(column_gap)};
    font-family: ${font_family}; font-size: ${base_font_pt}pt; line-height: ${line_height};
    text-align: ${justify === "justify" ? "justify" : "left"}; hyphens: ${hyphens};
  }

  #print-root .print-inner > :first-child { margin-top: 0 !important; }
  #print-root .print-inner :where(h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote):first-child { margin-top: 0 !important; }
  #print-root .print-inner img:first-child { margin-top: 0 !important; }
}
`;
    let style = document.getElementById("print-rules");
    if (!style) {
      style = document.createElement("style");
      style.id = "print-rules";
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  async function rerender() {
    if (!measurer_el) return;
    await tick();
    hydrated_html = await hydrate_html(full_content_html);
    await tick();
    pages = paginate({
      measurerEl: measurer_el,
      pagePx: page_px,
      pad,
      columns,
      columnGap: column_gap,
    });

    const out = [];
    if (pages.length) {
      out.push([null, pages[0]]);
      for (let i = 1; i < pages.length; i += 2) {
        out.push([pages[i] ?? null, pages[i + 1] ?? null]);
      }
    }
    sheets = out;

    inject_print_css();
  }

  $: full_content_html,
    page_px.h,
    page_px.w,
    columns,
    column_gap,
    pad.top,
    pad.right,
    pad.bottom,
    pad.left,
    base_font_px,
    line_height,
    justify,
    hyphens,
    font_family,
    print_mode,
    spread_gutter,
    size.id,
    rerender();

  function insert_at_cursor(snippet) {
    const el = ta;
    const start = el?.selectionStart ?? markdown.length;
    const end = el?.selectionEnd ?? markdown.length;
    markdown = markdown.slice(0, start) + snippet + markdown.slice(end);
    tick().then(() => {
      const pos = start + snippet.length;
      el?.setSelectionRange(pos, pos);
      el?.focus();
    });
  }
  const insert_page_break = () => insert_at_cursor("\n\n[[pagebreak]]\n\n");
  const insert_col_break = () => insert_at_cursor("\n\n[[colbreak]]\n\n");
  const insert_image_demo = () =>
    insert_at_cursor("\n\n![alt](https://picsum.photos/800/400)\n\n");

  let show_add_menu = false;
  let file_input;

  function toggle_add_menu() {
    show_add_menu = !show_add_menu;
  }
  function close_add_menu() {
    show_add_menu = false;
  }
  function on_choose_upload() {
    close_add_menu();
    file_input?.click();
  }
  async function on_files_selected(e) {
    const files = Array.from(e.currentTarget.files || []);
    for (const f of files) {
      await insert_image_file(f);
    }
    e.currentTarget.value = "";
  }
  async function on_choose_url() {
    close_add_menu();
    const url = window.prompt("Paste image URL:");
    if (!url) return;
    try {
      const file = await fetch_image_as_file(url);
      await insert_image_file(file);
    } catch (err) {
      console.error(err);
      alert("Could not fetch that image URL.");
    }
  }
  function on_choose_paste_hint() {
    close_add_menu();
    alert(
      "Tip: you can paste (Ctrl/Cmd+V) or drag & drop images into the editor."
    );
  }

  async function fetch_image_as_file(url) {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith("image/"))
      throw new Error("URL did not return an image");
    const name_from_url = (() => {
      try {
        const u = new URL(url);
        const last = u.pathname.split("/").pop() || "image";
        return last.includes(".") ? last : `${last}.jpg`;
      } catch {
        return "image.jpg";
      }
    })();
    return new File([blob], name_from_url, { type: blob.type || "image/jpeg" });
  }

  async function insert_image_file(file) {
    const { key, file: saved } = await save_image_to_idb(file);
    insert_ref_for_key(saved.name, key);

    gc_unused_images(markdown).catch(console.warn);
  }

  function on_drop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    files.forEach((f) => insert_image_file(f));
  }
  const prevent = (e) => e.preventDefault();

  function on_paste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const img = items.find((i) => i.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      insert_image_file(img.getAsFile());
    }
  }

  const print_pdf = () => {
    document.title = title;
    window.print();
  };

  let ta;
  onMount(async () => {
    ta?.focus();
    hydrated_html = await hydrate_html(full_content_html);
    await rerender();
    const est = await get_storage_estimate();
    if (est) {
      console.info(
        `storage usage ${(est.usage / 1024 / 1024).toFixed(1)} MB / quota ${(est.quota / 1024 / 1024).toFixed(1)} MB`
      );
    }

    const on_doc_click = (e) => {
      const menu = document.querySelector(".add-image-dropdown");
      const btn = document.querySelector(".btn-add-image");
      if (!menu || !btn) return;
      if (
        show_add_menu &&
        !menu.contains(e.target) &&
        !btn.contains(e.target)
      ) {
        close_add_menu();
      }
    };
    window.addEventListener("click", on_doc_click);
    onDestroy(() => window.removeEventListener("click", on_doc_click));
  });
  onDestroy(revoke_all_blob_urls);


  let left_percent = Number(localStorage.getItem("zine:left_percent") ?? 48);
  $: localStorage.setItem("zine:left_percent", String(left_percent));
  let dragging = false,
    start_x = 0,
    start_left_percent = left_percent;

  function on_splitter_down(e) {
    dragging = true;
    start_x = e.clientX;
    start_left_percent = left_percent;
    window.addEventListener("mousemove", on_move);
    window.addEventListener("mouseup", on_up);
  }
  function on_move(e) {
    if (!dragging) return;
    const total = document.querySelector(".workspace")?.clientWidth || 1;
    const dx = e.clientX - start_x;
    const delta = (dx / total) * 100;
    left_percent = Math.max(
      20,
      Math.min(80, Math.round((start_left_percent + delta) * 10) / 10)
    );
  }
  function on_up() {
    dragging = false;
    window.removeEventListener("mousemove", on_move);
    window.removeEventListener("mouseup", on_up);
  }

  async function on_image_input(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const url = URL.createObjectURL(f);
      insertAtCursor(`\n\n![${f.name}](${url})\n\n`);
    }
    e.target.value = "";
  }

  function insertAtCursor(snippet) {
    const el = ta;
    const start = el.selectionStart ?? markdown.length;
    const end = el.selectionEnd ?? markdown.length;
    markdown = markdown.slice(0, start) + snippet + markdown.slice(end);
    tick().then(() => {
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  }
</script>

<div class="topbar">
  <div class="group">
    <label
      >PDF Title
      <input type="text" bind:value={title} placeholder="Title…" />
    </label>
    <label
      >Size
      <select bind:value={page_size}>
        {#each Object.values(page_sizes) as s}
          <option value={s.id}>{s.label}</option>
        {/each}
      </select>
    </label>
    <button
      on:click={() => {
        margins = { ...page_sizes[page_size].margins };
      }}
    >
      Reset margins
    </button>
  </div>

  <div class="group">
    <label
      >T <input type="number" min="0" step="1" bind:value={margins.top} /> mm</label
    >
    <label
      >R <input type="number" min="0" step="1" bind:value={margins.right} /> mm</label
    >
    <label
      >B <input type="number" min="0" step="1" bind:value={margins.bottom} /> mm</label
    >
    <label
      >L <input type="number" min="0" step="1" bind:value={margins.left} /> mm</label
    >
  </div>

  <div class="group">
    <label
      >Cols <input type="number" min="1" step="1" bind:value={columns} /></label
    >
    <label
      >Gap <input type="number" min="0" step="1" bind:value={column_gap} /> mm</label
    >
  </div>

  <div class="group">
    <label
      >Font
      <select bind:value={font_family}>
        <option value="Georgia, Times New Roman, serif">Serif</option>
        <option value="Helvetica, Arial, sans-serif">Sans</option>
        <option value="Courier, monospace">Mono</option>
      </select>
    </label>
    <label
      >Size <input type="number" min="8" step="0.5" bind:value={base_font_pt} />
      pt</label
    >
    <label
      >LH <input
        type="number"
        min="1"
        step="0.1"
        bind:value={line_height}
      /></label
    >
    <label>
      <select bind:value={justify}>
        <option value="left">Ragged</option>
        <option value="justify">Justify</option>
      </select>
    </label>
    <label>
      <select bind:value={hyphens}>
        <option value="none">No hyphens</option>
        <option value="auto">Hyphens auto</option>
      </select>
    </label>
  </div>

  <div class="group">
    <label
      >Print
      <select bind:value={print_mode}>
        <option value="pages">Single pages</option>
        <option value="spreads">Spreads (2-up)</option>
      </select>
    </label>
    {#if print_mode === "spreads"}
      <label
        >Gutter <input
          type="number"
          min="0"
          step="1"
          bind:value={spread_gutter}
        /> mm</label
      >
    {/if}
  </div>

  <div class="group right">
    <div class="add-image-wrap">
      <input
        type="file"
        id="image_input"
        accept="image/*"
        multiple
        style="display:none"
        on:change={on_image_input}
      />
      <button on:click={() => document.getElementById("image_input").click()}>
        + Image
      </button>

      {#if show_add_menu}
        <div class="add-image-dropdown" on:click|stopPropagation>
          <button on:click={on_choose_upload}>Upload from device…</button>
          <button on:click={on_choose_url}>Add by URL…</button>
          <div class="add-image-sep"></div>
          <button on:click={on_choose_paste_hint}
            >Paste / Drag & Drop help</button
          >
        </div>
      {/if}

      <input
        class="hidden-file"
        type="file"
        accept="image/*"
        multiple
        bind:this={file_input}
        on:change={on_files_selected}
      />
    </div>

    <button on:click={insert_col_break}>+ Col Break</button>
    <button on:click={insert_page_break}>+ Page Break</button>
    <button class="primary" on:click={print_pdf}>Print / PDF</button>
  </div>
</div>

<div
  class="workspace"
  style={`grid-template-columns:${left_percent}% 8px ${100 - left_percent}%`}
>
  <section class="left" on:dragover|preventDefault={prevent} on:drop={on_drop}>
    <div class="editor">
      <div class="header">
        <div>Markdown</div>
        <div class="meta">{pages.length} pages · {columns} col</div>
      </div>
      <textarea
        bind:value={markdown}
        bind:this={ta}
        spellcheck="false"
        on:paste={on_paste}
      ></textarea>
      <div class="hint">
        Tip: <code>[[pagebreak]]</code> · <code>[[colbreak]]</code> · raw HTML ok.
        Drop/paste images to store in IndexedDB, or use “Add image ▾”.
      </div>
    </div>
  </section>

  <div
    class="splitter"
    on:mousedown={on_splitter_down}
    title="Drag to resize"
  ></div>

  <section class="right">
    <div id="measurer" bind:this={measurer_el} style={measurer_style}>
      {@html hydrated_html}
    </div>

    <div class="spreads">
      {#each pages as page_html, i}
        <div class="page" style={page_style}>
          <div class="page-inner preview" style={inner_style}>
            {@html page_html}
          </div>
          {#if i > 0}<div class="page-footer">{i + 1}</div>{/if}
        </div>
      {/each}
    </div>

    <div id="print-root" aria-hidden="true" style="display:none">
      {#if print_mode === "pages"}
        {#each pages as page_html}
          <div class="print-page">
            <div class="print-inner">
              {@html page_html}
            </div>
          </div>
        {/each}
      {:else}
        {#each sheets as pair}
          <div class="print-sheet">
            <div class="print-page">
              <div class="print-inner">
                {@html pair[0] || ""}
              </div>
            </div>
            <div class="print-gutter"></div>
            <div class="print-page">
              <div class="print-inner">
                {@html pair[1] || ""}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>

<style>
  .add-image-wrap {
    position: relative;
    display: inline-block;
  }
  
  .add-image-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    min-width: 220px;
    z-index: 10;
  }
  .add-image-dropdown button {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    padding: 8px 10px;
    cursor: pointer;
  }
  .add-image-dropdown button:hover {
    background: #f2f4f7;
  }
  .add-image-sep {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }
  input[type="file"].hidden-file {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }
</style>
