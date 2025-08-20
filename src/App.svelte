<script>
  import { onMount, tick } from "svelte";
  import { page_sizes, px_per_mm, buildPrintCSS } from "./lib/formats";
  import { preprocessMarkdown } from "./lib/markers";
  import { paginate } from "./lib/paginate";

  const default_md = `# Cover {.full}
Welcome! This is the cover.

[[pagebreak]]

## Two Columns {.full}
This text will fill the left column first, then the right. Keep typing to see it flow across columns and then to the next page once both columns are full.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus pharetra, augue vitae convallis accumsan, purus erat feugiat arcu, non vehicula nibh nibh id nisl.

[[colbreak]]

This part starts at the top of the RIGHT column thanks to [[colbreak]].

[[pagebreak]]

## Images {.full}
![sample](https://picsum.photos/800/420)
More text after the image.
`;

  let title = localStorage.getItem("zine:title") ?? "Untitled Zine";
  let pageSize = localStorage.getItem("zine:pageSize") ?? "A5";
  let margins = JSON.parse(
    localStorage.getItem("zine:margins") ??
      JSON.stringify(page_sizes.A5.margins)
  );
  let markdown = localStorage.getItem("zine:markdown") ?? default_md;

  let columns = Number(localStorage.getItem("zine:columns") ?? 1);
  let columnGap = Number(localStorage.getItem("zine:columnGap") ?? 5);

  let fontFamily =
    localStorage.getItem("zine:fontFamily") ??
    "Georgia, 'Times New Roman', serif";
  let baseFontPt = Number(localStorage.getItem("zine:baseFontPt") ?? 11);
  let lineHeight = Number(localStorage.getItem("zine:lineHeight") ?? 1.5);
  let justify = localStorage.getItem("zine:justify") ?? "left";
  let hyphens = localStorage.getItem("zine:hyphens") ?? "auto";

  let printMode = localStorage.getItem("zine:printMode") ?? "pages";
  let spreadGutter = Number(localStorage.getItem("zine:spreadGutter") ?? 6);

  $: localStorage.setItem("zine:title", title);
  $: localStorage.setItem("zine:pageSize", pageSize);
  $: localStorage.setItem("zine:margins", JSON.stringify(margins));
  $: localStorage.setItem("zine:markdown", markdown);
  $: localStorage.setItem("zine:columns", String(columns));
  $: localStorage.setItem("zine:columnGap", String(columnGap));
  $: localStorage.setItem("zine:fontFamily", fontFamily);
  $: localStorage.setItem("zine:baseFontPt", String(baseFontPt));
  $: localStorage.setItem("zine:lineHeight", String(lineHeight));
  $: localStorage.setItem("zine:justify", justify);
  $: localStorage.setItem("zine:hyphens", hyphens);
  $: localStorage.setItem("zine:printMode", printMode);
  $: localStorage.setItem("zine:spreadGutter", String(spreadGutter));

  $: size = page_sizes[pageSize] ?? page_sizes.A5;
  $: pagePx = {
    w: Math.round(size.w * px_per_mm),
    h: Math.round(size.h * px_per_mm),
  };
  $: pad = {
    top: Math.round(margins.top * px_per_mm),
    right: Math.round(margins.right * px_per_mm),
    bottom: Math.round(margins.bottom * px_per_mm),
    left: Math.round(margins.left * px_per_mm),
  };

  const PT_TO_PX = 96 / 72;
  $: baseFontPx = Math.round(baseFontPt * PT_TO_PX * 100) / 100;

  $: textStyle = `
    font-family:${fontFamily};
    font-size:${baseFontPx}px;
    line-height:${lineHeight};
    text-align:${justify === "justify" ? "justify" : "left"};
    hyphens:${hyphens};
  `;

  $: pageStyle = `width:${pagePx.w}px;height:${pagePx.h}px;--margin-bottom:${margins.bottom}`;
  $: innerStyle = `
    padding:${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px;
    column-count:${columns}; column-gap:${columnGap}mm;
    ${textStyle}
  `;
  $: measurerStyle = `
    position:absolute; left:-99999px; top:0; opacity:0; pointer-events:none;
    width:${pagePx.w - (pad.left + pad.right)}px;
    ${textStyle}
  `;

  $: fullContentHtml = preprocessMarkdown(markdown);

  let pages = [];
  let measurerEl;

  async function rerender() {
    if (!measurerEl) return;
    await tick();
    pages = paginate({ measurerEl, pagePx, pad, columns, columnGap });
    injectPrintCSS();
  }

  function injectPrintCSS() {
    const s = page_sizes[pageSize] ?? page_sizes.A5;
    const mm = (n) => `${n}mm`;

    const sheetW = printMode === "spreads" ? s.w * 2 + spreadGutter : s.w;
    const sheetH = s.h;

    const css = `
@page {
  size: ${mm(sheetW)} ${mm(sheetH)};
  margin: 0;
}

@media print {
  body { background: #fff !important; }

  /* Hide UI / preview; show print-root */
  .topbar,
  .workspace .left,
  .workspace .splitter,
  .right .spreads { display: none !important; }

  #print-root { display: block !important; }

  /* Single-page mode */
  #print-root .print-page {
    width: ${mm(s.w)};
    height: ${mm(s.h)};
    background: #fff;
    box-shadow: none !important;
    page-break-after: always;
  }
  #print-root .print-page:last-child { page-break-after: auto; }

  /* Spreads mode (2-up) */
  #print-root .print-sheet {
    display: flex;
    align-items: stretch;
    width: ${mm(sheetW)};
    height: ${mm(sheetH)};
    page-break-after: always;
    background: #fff;
  }
  #print-root .print-sheet:last-child { page-break-after: auto; }

  #print-root .print-gutter {
    width: ${mm(spreadGutter)};
    flex: 0 0 ${mm(spreadGutter)};
  }

  /* Inner content — use mm padding + columns + your type */
  #print-root .print-inner {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    overflow: hidden;

    padding: ${mm(margins.top)} ${mm(margins.right)} ${mm(margins.bottom)} ${mm(margins.left)};
    column-count: ${columns};
    column-gap: ${mm(columnGap)};

    font-family: ${fontFamily};
    font-size: ${baseFontPt}pt;
    line-height: ${lineHeight};
    text-align: ${justify === "justify" ? "justify" : "left"};
    hyphens: ${hyphens};
  }
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

  $: sheets = (() => {
    if (!pages || !pages.length) return [];

    const out = [];

    out.push([null, pages[0]]);

    for (let i = 1; i < pages.length; i += 2) {
      out.push([pages[i] ?? null, pages[i + 1] ?? null]);
    }
    return out;
  })();

  $: fullContentHtml,
    pagePx.h,
    pagePx.w,
    columns,
    columnGap,
    pad.top,
    pad.right,
    pad.bottom,
    pad.left,
    baseFontPx,
    lineHeight,
    justify,
    hyphens,
    fontFamily,
    printMode,
    spreadGutter,
    size.id,
    rerender();

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
  const insertPageBreak = () => insertAtCursor("\n\n[[pagebreak]]\n\n");
  const insertColBreak = () => insertAtCursor("\n\n[[colbreak]]\n\n");
  const insertImage = () =>
    insertAtCursor("\n\n![alt](https://picsum.photos/800/400)\n\n");

  function onDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    for (const f of files) {
      const url = URL.createObjectURL(f);
      insertAtCursor(`\n\n![${f.name}](${url})\n\n`);
    }
  }
  const prevent = (e) => e.preventDefault();
  function onPaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const img = items.find((i) => i.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      const file = img.getAsFile();
      const url = URL.createObjectURL(file);
      insertAtCursor(`\n\n![pasted](${url})\n\n`);
    }
  }

  const printPDF = () => {
    document.title = title;
    window.print();
  };

  let ta;
  onMount(() => {
    ta?.focus();
    injectPrintCSS();
    rerender();
  });

  let leftPercent = Number(localStorage.getItem("zine:leftPercent") ?? 48);
  $: localStorage.setItem("zine:leftPercent", String(leftPercent));
  let dragging = false,
    startX = 0,
    startLeftPercent = leftPercent;
  function onSplitterDown(e) {
    dragging = true;
    startX = e.clientX;
    startLeftPercent = leftPercent;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  function onMove(e) {
    if (!dragging) return;
    const total = document.querySelector(".workspace")?.clientWidth || 1;
    const dx = e.clientX - startX;
    const delta = (dx / total) * 100;
    leftPercent = Math.max(
      20,
      Math.min(80, Math.round((startLeftPercent + delta) * 10) / 10)
    );
  }
  function onUp() {
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }
</script>

<div class="topbar">
  <div class="group">
    <label
      >PDF Title <input
        type="text"
        bind:value={title}
        placeholder="Title…"
      /></label
    >
    <label
      >Size
      <select bind:value={pageSize}>
        {#each Object.values(page_sizes) as s}
          <option value={s.id}>{s.label}</option>
        {/each}
      </select>
    </label>
    <button
      on:click={() => {
        margins = { ...page_sizes[pageSize].margins };
      }}>Reset margins</button
    >
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
      >Gap <input type="number" min="0" step="1" bind:value={columnGap} /> mm</label
    >
  </div>

  <div class="group">
    <label
      >Font
      <select bind:value={fontFamily}>
        <option value="Georgia, Times New Roman, serif">Serif</option>
        <option value="Helvetica, Arial, sans-serif">Sans</option>
        <option value="Courier, monospace">Mono</option>
      </select>
    </label>
    <label
      >Size <input type="number" min="8" step="0.5" bind:value={baseFontPt} /> pt</label
    >
    <label
      >LH <input
        type="number"
        min="1"
        step="0.1"
        bind:value={lineHeight}
      /></label
    >
    <label
      ><select bind:value={justify}
        ><option value="left">Ragged</option><option value="justify"
          >Justify</option
        ></select
      ></label
    >
    <label
      ><select bind:value={hyphens}
        ><option value="none">No hyphens</option><option value="auto"
          >Hyphens auto</option
        ></select
      ></label
    >
  </div>

  <div class="group">
    <label
      >Print
      <select bind:value={printMode}>
        <option value="pages">Single pages</option>
        <option value="spreads">Spreads (2-up)</option>
      </select>
    </label>
    {#if printMode === "spreads"}
      <label
        >Gutter <input
          type="number"
          min="0"
          step="1"
          bind:value={spreadGutter}
        /> mm</label
      >
    {/if}
  </div>

  <div class="group right">
    <button on:click={insertImage}>+ Image</button>
    <button on:click={insertColBreak}>+ Col Break</button>
    <button on:click={insertPageBreak}>+ Page Break</button>
    <button class="primary" on:click={printPDF}>Print / PDF</button>
  </div>
</div>

<div
  class="workspace"
  style={`grid-template-columns:${leftPercent}% 8px ${100 - leftPercent}%`}
>
  <section class="left" on:dragover|preventDefault={prevent} on:drop={onDrop}>
    <div class="editor">
      <div class="header">
        <div>Markdown</div>
        <div class="meta">{pages.length} pages · {columns} col</div>
      </div>
      <textarea
        bind:value={markdown}
        bind:this={ta}
        spellcheck="false"
        on:paste={onPaste}
      ></textarea>
      <div class="hint">
        Tip: <code>[[pagebreak]]</code> · <code>[[colbreak]]</code> · raw HTML
        ok · classes: <code>.full</code>, <code>.img-wide</code>,
        <code>.cols-1</code>, <code>.cols-2</code>.
      </div>
    </div>
  </section>

  <div
    class="splitter"
    on:mousedown={onSplitterDown}
    title="Drag to resize"
  ></div>

  <section class="right">
    <div id="measurer" bind:this={measurerEl} style={measurerStyle}>
      {@html fullContentHtml}
    </div>

    <div class="spreads">
      {#each pages as pageHtml, i}
        <div class="page" style={pageStyle}>
          <div class="page-inner preview" style={innerStyle}>
            {@html pageHtml}
          </div>
          {#if i > 0}<div class="page-footer">{i + 1}</div>{/if}
        </div>
      {/each}
    </div>
    <div id="print-root" aria-hidden="true" style="display:none">
      {#if printMode === "pages"}
        {#each pages as pageHtml}
          <div class="print-page">
            <div class="print-inner">
              {@html pageHtml}
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
