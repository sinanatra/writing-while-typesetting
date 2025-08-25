<script>
  export let print_mode;
  export let spread_gutter;
  export let arrangement;
  export let preview_zoom;

  export let on_export_book = () => {};
  export let on_import_book = () => {};
  export let print_pdf = () => {};

  export let insert_head = () => {};
  export let insert_foot = () => {};
  export let insert_col_break = () => {};
  export let insert_row_break = () => {};
  export let insert_page_break = () => {};
  export let on_image_input = () => {};

  let imgInput, imgFullInput;
</script>

<div class="group right">
  <button on:click={insert_head}>+ Head</button>
  <button on:click={insert_foot}>+ Foot</button>

  <input
    type="file"
    accept="image/*"
    multiple
    style="display:none"
    bind:this={imgInput}
    on:change={(e) => on_image_input(e, false)}
  />
  <input
    type="file"
    accept="image/*"
    multiple
    style="display:none"
    bind:this={imgFullInput}
    on:change={(e) => on_image_input(e, true)}
  />
  <button on:click={() => imgInput.click()}>+ Image</button>
  <button on:click={() => imgFullInput.click()}>+ Full Image</button>

  <button on:click={insert_col_break}>+ Col Break</button>
  <button on:click={insert_row_break}>+ Row Break</button>
  <button on:click={insert_page_break}>+ Page Break</button>
</div>

<div class="group right">
  <input
    type="file"
    accept="application/json"
    style="display:none"
    on:change={on_import_book}
    id="import_book_input"
  />

  <button on:click={() => document.getElementById("import_book_input").click()}
    >Import</button
  >
  
  <button class="primary" on:click={on_export_book}>Save</button>

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
        >Gutter
        <input type="number" min="0" step="1" bind:value={spread_gutter} /> mm
      </label>
      <label
        >Order
        <select bind:value={arrangement}>
          <option value="sequential">Editorial (1–2, 3–4…)</option>
          <option value="booklet">Booklet (printer spreads)</option>
        </select>
      </label>
    {/if}
  </div>

  <button class="primary" on:click={print_pdf}>Print / PDF</button>
</div>

<div class="zoombar">
  <input type="range" min="25" max="200" step="5" bind:value={preview_zoom} />
  <button type="button" on:click={() => (preview_zoom = 100)}>100%</button>
  <span class="zoomval">{Math.round(preview_zoom)}%</span>
</div>
