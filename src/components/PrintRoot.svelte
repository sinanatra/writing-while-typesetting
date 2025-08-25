<script>
  export let print_mode = "pages";
  export let pages = [];
  export let sheets = [];
  export let sheet_idxs = [];
  export let inner_style = "";
  export let run_heads = [];
  export let run_foots = [];
</script>

<div id="print-root" aria-hidden="true" style="display:none">
  {#if print_mode === "pages"}
    {#each pages as page_html, i}
      <div class="print-page">
        <div class="print-running-header">{run_heads[i] || ""}</div>
        <div
          class="print-inner"
          class:fullpage={page_html.includes("img-page")}
          style={inner_style}
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
            {#if sheet_idxs[sidx][0] != null}{run_heads[sheet_idxs[sidx][0]] ||
                ""}{/if}
          </div>
          <div
            class="print-inner"
            class:fullpage={(pair[0] || "").includes("img-page")}
            style={inner_style}
          >
            {@html pair[0] || ""}
          </div>
          <div class="print-running-footer">
            {#if sheet_idxs[sidx][0] != null}{run_foots[sheet_idxs[sidx][0]] ||
                ""}{/if}
          </div>
          <div class="print-page-number lef">
            {#if sheet_idxs[sidx][0] != null}{sheet_idxs[sidx][0] + 1}{/if}
          </div>
        </div>

        <div class="print-gutter"></div>

        <div class="print-page">
          <div class="print-running-header">
            {#if sheet_idxs[sidx][1] != null}{run_heads[sheet_idxs[sidx][1]] ||
                ""}{/if}
          </div>
          <div
            class="print-inner"
            class:fullpage={(pair[1] || "").includes("img-page")}
            style={inner_style}
          >
            {@html pair[1] || ""}
          </div>
          <div class="print-running-footer">
            {#if sheet_idxs[sidx][1] != null}{run_foots[sheet_idxs[sidx][1]] ||
                ""}{/if}
          </div>
          <div class="print-page-number rig">
            {#if sheet_idxs[sidx][1] != null}{sheet_idxs[sidx][1] + 1}{/if}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>
