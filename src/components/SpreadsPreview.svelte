<script>
  export let pages = [];
  export let run_heads = [];
  export let run_foots = [];
  export let page_style = "";
  export let inner_style = "";
  export let zoom_scale = 1;
</script>

<div class="spreads-viewport">
  <div
    class="spreads-scale"
    style={`transform:scale(${zoom_scale}); transform-origin: top left;`}
  >
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
          <div class="page-number {i % 2 === 0 ? 'rig' : 'lef'}">{i + 1}</div>
        </div>
      {/each}
    </div>
  </div>
</div>
