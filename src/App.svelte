<script>
  import { onMount, onDestroy, tick } from "svelte";
  import TopbarLayout from "./components/TopbarLayout.svelte";
  import TopbarTypography from "./components/TopbarTypography.svelte";
  import TopbarIO from "./components/TopbarIO.svelte";
  import MarkdownEditor from "./components/MarkdownEditor.svelte";
  import SpreadsPreview from "./components/SpreadsPreview.svelte";
  import PrintRoot from "./components/PrintRoot.svelte";
  import Splitter from "./components/Splitter.svelte";

  import { revoke_all_blob_urls } from "./lib/images";
  import { page_sizes, px_per_mm } from "./lib/formats";
  import { preprocess_markdown } from "./lib/markers";
  import { paginate } from "./lib/paginate";
  import { inject_print_css } from "./lib/print_css";
  import { export_book, import_book_from_file } from "./lib/save_import.js";
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
  $: columns = Number(localStorage.getItem("zine:columns") ?? 1);
  let column_gap = Number(localStorage.getItem("zine:column_gap") ?? 5);
  let font_family =
    localStorage.getItem("zine:font_family") ?? "Courier, monospace";
  let base_font_pt = Number(localStorage.getItem("zine:base_font_pt") ?? 8);
  let line_height = Number(localStorage.getItem("zine:line_height") ?? 1);
  let justify = localStorage.getItem("zine:justify") ?? "left";
  let hyphens = localStorage.getItem("zine:hyphens") ?? "auto";
  let print_mode = localStorage.getItem("zine:print_mode") ?? "pages";
  let spread_gutter = Number(localStorage.getItem("zine:spread_gutter") ?? 6);
  let preview_zoom = Number(localStorage.getItem("zine:zoom") ?? 100);
  let arrangement = localStorage.getItem("zine:arrangement") ?? "booklet";

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
  $: localStorage.setItem("zine:zoom", String(preview_zoom));
  $: localStorage.setItem("zine:arrangement", arrangement);

  let sheet_idxs = [];
  let hydrated_html = "";
  let pages = [];
  let sheets = [];
  let measurer_el;
  let storage_text = "";
  let run_heads = [];
  let run_foots = [];
  $: zoom_scale = Math.max(10, Math.min(400, preview_zoom)) / 100;

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

  function on_import_book(e) {
    const file = e.target?.files?.[0];
    if (!file) return;
    import_book_from_file(
      file,
      {
        title: (v) => (title = v ?? title),
        page_size: (v) => (page_size = v ?? page_size),
        margins: (v) => (margins = v ?? margins),
        markdown: (v) => (markdown = v ?? markdown),
        columns: (v) => (columns = v ?? columns),
        column_gap: (v) => (column_gap = v ?? column_gap),
        font_family: (v) => (font_family = v ?? font_family),
        base_font_pt: (v) => (base_font_pt = v ?? base_font_pt),
        line_height: (v) => (line_height = v ?? line_height),
        justify: (v) => (justify = v ?? justify),
        hyphens: (v) => (hyphens = v ?? hyphens),
        print_mode: (v) => (print_mode = v ?? print_mode),
        spread_gutter: (v) => (spread_gutter = v ?? spread_gutter),
        left_percent: (v) => (left_percent = v ?? left_percent),
      },
      rerender
    );
  }

  function pairSequentialIdxs(n) {
    const idxs = [];
    if (n <= 0) return idxs;
    idxs.push([null, 0]);
    for (let i = 1; i < n; i += 2) {
      idxs.push([i, i + 1 < n ? i + 1 : null]);
    }
    return idxs;
  }

  function imposeBookletIdxs(n) {
    const m = n + ((4 - (n % 4)) % 4);
    const idxs = [];
    let L = 0,
      R = m - 1;
    while (L < R) {
      idxs.push([R < n ? R : null, L < n ? L : null]);
      idxs.push([L + 1 < n ? L + 1 : null, R - 1 < n ? R - 1 : null]);
      L += 2;
      R -= 2;
    }
    return idxs;
  }

  function buildSheetsFrom(pagesArr, mode) {
    const idxs =
      mode === "booklet"
        ? imposeBookletIdxs(pagesArr.length)
        : pairSequentialIdxs(pagesArr.length);

    const pairs = idxs.map(([li, ri]) => [
      li != null ? pagesArr[li] : "",
      ri != null ? pagesArr[ri] : "",
    ]);

    return { pairs, idxs };
  }

  function on_export_book() {
    export_book({
      title,
      page_size,
      margins,
      markdown,
      columns,
      column_gap,
      font_family,
      base_font_pt,
      line_height,
      justify,
      hyphens,
      print_mode,
      spread_gutter,
      left_percent,
    });
  }

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

      const built = buildSheetsFrom(
        pages,
        print_mode === "spreads" ? arrangement : "sequential"
      );
      sheets = built.pairs;
      sheet_idxs = built.idxs;

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
    arrangement,
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

  const insert_row_break = () => insert_at_cursor("\n\n[[rowbreak:1]]\n\n");
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
      const new_size = Math.max(0.5, Math.min(4, cur + delta)).toFixed(2);
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

<TopbarLayout
  bind:title
  {page_sizes}
  bind:page_size
  bind:margins
  bind:columns
  bind:column_gap
/>
<div class="topbar">
  <TopbarTypography
    bind:font_family
    bind:base_font_pt
    bind:line_height
    bind:justify
    bind:hyphens
    {make_smaller}
    {make_larger}
  />

  <TopbarIO
    bind:print_mode
    bind:spread_gutter
    bind:arrangement
    bind:preview_zoom
    {on_export_book}
    {on_import_book}
    {print_pdf}
    {insert_head}
    {insert_foot}
    {insert_col_break}
    {insert_row_break}
    {insert_page_break}
    {on_image_input}
    {wrap_selection_cols}
    {wrap_selection_as}
    {columns}
  />
</div>

<div
  class="workspace"
  style={`grid-template-columns:${left_percent}% 8px ${100 - left_percent}%`}
>
  <MarkdownEditor
    bind:markdown
    {storage_text}
    pages_len={pages.length}
    {columns}
    {on_paste}
    {on_drop}
    {prevent}
    bind:taEl={ta}
  />

  <Splitter onDown={on_splitter_down} />

  <section class="right">
    <div id="measurer" bind:this={measurer_el} style={measurer_style}>
      {@html hydrated_html}
    </div>

    <SpreadsPreview
      {pages}
      {run_heads}
      {run_foots}
      {page_style}
      {inner_style}
      {zoom_scale}
    />

    <PrintRoot
      {print_mode}
      {pages}
      {sheets}
      {sheet_idxs}
      {inner_style}
      {run_heads}
      {run_foots}
    />
  </section>
</div>
