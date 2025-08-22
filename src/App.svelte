<script>
  import { onMount, onDestroy, tick } from "svelte";
  import { revoke_all_blob_urls } from "./lib/images";
  import { page_sizes, px_per_mm } from "./lib/formats";
  import { preprocess_markdown } from "./lib/markers";
  import { paginate } from "./lib/paginate";
  import { inject_print_css } from "./lib/print_css";
  import {
    save_image_to_idb,
    hydrate_html,
    gc_unused_images,
    current_usage_mb,
  } from "./lib/images";

  const default_md = `## Can we write while we are typesetting a book?
[[pagebreak]]`;

  let title = localStorage.getItem("zine:title") ?? "Untitled Zine";
  let page_size = localStorage.getItem("zine:page_size") ?? "A7";
  let margins = JSON.parse(
    localStorage.getItem("zine:margins") ??
      JSON.stringify(page_sizes.A7.margins)
  );
  let markdown = localStorage.getItem("zine:markdown") ?? default_md;
  let columns = Number(localStorage.getItem("zine:columns") ?? 1);
  let column_gap = Number(localStorage.getItem("zine:column_gap") ?? 5);
  let font_family =
    localStorage.getItem("zine:font_family") ?? "Courier, monospace";
  let base_font_pt = Number(localStorage.getItem("zine:base_font_pt") ?? 8);
  let line_height = Number(localStorage.getItem("zine:line_height") ?? 1);
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

  $: size = page_sizes[page_size] ?? page_sizes.A7;
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

  $: page_style = `
  width:${page_px.w}px;
  height:${page_px.h}px;
  --margin-bottom:${margins.bottom};
  font-family:${font_family};
  `;

  $: inner_style = `
    padding:${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px;
    --pad-top:${pad.top}px; --pad-right:${pad.right}px; --pad-bottom:${pad.bottom}px; --pad-left:${pad.left}px;
    column-count:${columns}; column-gap:${column_gap}mm;
    ${text_style}
  `;
  $: measurer_style = `
    position:absolute; left:-99999px; top:0; opacity:0; pointer-events:none;
    width:${page_px.w - (pad.left + pad.right)}px;
    ${text_style}
  `;

  $: full_content_html = preprocess_markdown(markdown);
  let hydrated_html = "";
  let pages = [];
  let sheets = [];
  let measurer_el;
  let storage_text = "";
  let run_heads = [];
  let run_foots = [];

  async function refresh_storage_text() {
    const usage = await current_usage_mb();
    storage_text = `Storage ${usage.toFixed(1)} MB`;
  }

  let rerender_timer;
  async function rerender() {
    if (rerender_timer) clearTimeout(rerender_timer);
    rerender_timer = setTimeout(async () => {
      if (!measurer_el) return;
      await tick();
      hydrated_html = await hydrate_html(full_content_html);
      await tick();

      const res = paginate({
        measurerEl: measurer_el,
        pagePx: page_px,
        pad,
        columns,
        columnGap: column_gap,
      });
      pages = res.pages;
      run_heads = res.heads;
      run_foots = res.foots;

      const out = [];
      if (pages.length) {
        out.push([null, pages[0]]);
        for (let i = 1; i < pages.length; i += 2)
          out.push([pages[i] ?? null, pages[i + 1] ?? null]);
      }
      sheets = out;
      inject_print_css(
        size,
        margins,
        columns,
        column_gap,
        font_family,
        base_font_pt,
        line_height,
        justify,
        hyphens,
        print_mode,
        spread_gutter
      );
    }, 60);
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
  function wrap_selection_as(class_name) {
    const el = ta;
    const start = el?.selectionStart ?? markdown.length;
    const end = el?.selectionEnd ?? markdown.length;
    const sel = markdown.slice(start, end) || "";
    const before = markdown.slice(0, start);
    const after = markdown.slice(end);
    const wrapped = `\n\n<div class="${class_name}">\n${sel}\n</div>\n\n`;
    markdown = before + wrapped + after;
    tick().then(() => {
      const pos = (before + wrapped).length;
      el?.setSelectionRange(pos, pos);
      el?.focus();
    });
  }
  function wrap_selection_cols(n) {
    const el = ta;
    const start = el?.selectionStart ?? markdown.length;
    const end = el?.selectionEnd ?? markdown.length;
    const sel = markdown.slice(start, end) || "";
    const before = markdown.slice(0, start);
    const after = markdown.slice(end);
    const wrapped = `\n\n<div class="cols" style="column-count:${n};">\n${sel}\n</div>\n\n`;
    markdown = before + wrapped + after;
    tick().then(() => {
      const pos = (before + wrapped).length;
      el?.setSelectionRange(pos, pos);
      el?.focus();
    });
  }

  const insert_row_break = () => insert_at_cursor("\n\n[[rowbreak]]\n\n");
  const insert_page_break = () => insert_at_cursor("\n\n[[pagebreak]]\n\n");
  const insert_col_break = () => insert_at_cursor("\n\n[[colbreak]]\n\n");
  const insert_head = () => insert_at_cursor("\n\n[[head: Your Heading]]\n\n");
  const insert_foot = () => insert_at_cursor("\n\n[[foot: Your Footer]]\n\n");

  async function insert_image_file(file, full = false) {
    const { key, file: saved } = await save_image_to_idb(file);
    if (full)
      insert_at_cursor(
        `\n\n[[pagebreak]]\n<img src="appimg://${key}" alt="${saved.name}" class="img-page" />\n[[pagebreak]]\n`
      );
    else insert_at_cursor(`\n\n![${saved.name}](appimg://${key})\n\n`);
    await gc_unused_images(markdown).catch(() => {});
    await refresh_storage_text();
  }

  let insert_active = 0;
  async function guarded_insert(fn) {
    while (insert_active >= 1) await new Promise((r) => setTimeout(r, 30));
    insert_active++;
    try {
      return await fn();
    } finally {
      insert_active--;
    }
  }

  function on_drop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    files.reduce(
      (p, f) => p.then(() => guarded_insert(() => insert_image_file(f, false))),
      Promise.resolve()
    );
  }
  const prevent = (e) => e.preventDefault();
  function on_paste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const img = items.find((i) => i.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      guarded_insert(() => insert_image_file(img.getAsFile(), false));
    }
  }
  async function on_image_input(e, full) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      await guarded_insert(() => insert_image_file(f, full));
    }
    e.target.value = "";
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
    await refresh_storage_text();
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
  function para_bounds(md, pos) {
    const prev = md.lastIndexOf("\n\n", Math.max(0, pos - 1));
    const next = md.indexOf("\n\n", pos);
    const s = prev >= 0 ? prev + 2 : 0;
    const e = next >= 0 ? next : md.length;
    return [s, e];
  }

  function apply_font_scale(delta) {
    const el = ta;
    const sel_start = el?.selectionStart ?? markdown.length;
    const sel_end = el?.selectionEnd ?? markdown.length;
    let s = sel_start,
      e = sel_end;
    if (s === e) [s, e] = para_bounds(markdown, s);

    let before = markdown.slice(0, s);
    let sel = markdown.slice(s, e);
    let after = markdown.slice(e);

    const re = /^<span style="font-size:([\d.]+)em">([\s\S]*)<\/span>$/;
    const m = sel.match(re);
    if (m) {
      let cur = parseFloat(m[1]);
      const inner = m[2];
      const new_size = Math.max(0.5, Math.min(4, cur + delta));
      sel = `<span style="font-size:${new_size}em">${inner}</span>`;
    } else {
      const new_size = 1 + delta;
      sel = `<span style="font-size:${new_size}em">${sel}</span>`;
    }

    markdown = before + sel + after;

    tick().then(() => {
      const pos = (before + sel).length;
      el?.setSelectionRange(pos, pos);
      el?.focus();
    });
  }

  const make_smaller = () => apply_font_scale(-0.1);
  const make_larger = () => apply_font_scale(+0.1);
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
      >Size <input type="number" min="3" step="0.5" bind:value={base_font_pt} />
      pt</label
    >
    <label
      >LH <input
        type="number"
        min="0.5"
        step="0.1"
        bind:value={line_height}
      /></label
    >
    <button on:click={make_smaller}>A−</button>
    <button on:click={make_larger}>A+</button>

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
    <button on:click={insert_head}>+ Head</button>
    <button on:click={insert_foot}>+ Foot</button>

    <input
      type="file"
      id="image_input"
      accept="image/*"
      multiple
      style="display:none"
      on:change={(e) => on_image_input(e, false)}
    />
    <input
      type="file"
      id="image_input_full"
      accept="image/*"
      multiple
      style="display:none"
      on:change={(e) => on_image_input(e, true)}
    />
    <button on:click={() => document.getElementById("image_input").click()}
      >+ Image</button
    >
    <button on:click={() => document.getElementById("image_input_full").click()}
      >+ Full Image</button
    >
    <button on:click={() => wrap_selection_as("span-all")}>Span all</button>
    {#each Array(columns) as _, i}
      <button on:click={() => wrap_selection_cols(i + 1)}>{i + 1} col</button>
    {/each}
    <button on:click={insert_col_break}>+ Col Break</button>
    <button on:click={insert_row_break}>+ Row Break</button>
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
      <div class="hint storage-indicator">{storage_text}</div>
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
          <div class="page-running-header">{run_heads[i] || ""}</div>
          <div
            class="page-inner preview"
            style={inner_style}
            class:fullpage={page_html.includes("img-page")}
          >
            {@html page_html}
          </div>
          <div class="page-running-footer">{run_foots[i] || ""}</div>
          <div class="page-number {i % 2 === 0 ? 'rig' : 'lef'}">
            {i + 1}
          </div>
        </div>
      {/each}
    </div>

    <div id="print-root" aria-hidden="true" style="display:none">
      {#if print_mode === "pages"}
        {#each pages as page_html, i}
          <div class="print-page">
            <div class="print-running-header">{run_heads[i] || ""}</div>
            <div
              class="print-inner"
              class:fullpage={page_html.includes("img-page")}
            >
              {@html page_html}
            </div>
            <div class="print-running-footer">{run_foots[i] || ""}</div>
            <div class="print-page-number {i % 2 === 0 ? 'rig' : 'lef'}">
              {i + 1}
            </div>
          </div>
        {/each}
      {:else}
        {#each sheets as pair, sidx}
          <div class="print-sheet">
            <div class="print-page">
              <div class="print-running-header">
                {sidx === 0 ? "" : run_heads[2 * sidx - 1] || ""}
              </div>
              <div
                class="print-inner"
                class:fullpage={(pair[0] || "").includes("img-page")}
              >
                {@html pair[0] || ""}
              </div>
              <div class="print-running-footer">
                {sidx === 0 ? "" : run_foots[2 * sidx - 1] || ""}
              </div>
              <div class="print-page-number lef">{2 * sidx + 1}</div>
            </div>

            <div class="print-gutter"></div>

            <div class="print-page">
              <div class="print-running-header">
                {run_heads[2 * sidx] || (sidx === 0 ? run_heads[0] || "" : "")}
              </div>
              <div
                class="print-inner"
                class:fullpage={(pair[1] || "").includes("img-page")}
              >
                {@html pair[1] || ""}
              </div>
              <div class="print-running-footer">
                {run_foots[2 * sidx] || (sidx === 0 ? run_foots[0] || "" : "")}
              </div>
              <div class="print-page-number rig">{2 * sidx + 2}</div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>
