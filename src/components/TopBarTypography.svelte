<script>
  export let font_family;
  export let base_font_pt;
  export let line_height;
  export let justify;
  export let hyphens;
  export let make_smaller = () => {};
  export let make_larger = () => {};
</script>

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
    >Size
    <input type="number" min="3" step="0.5" bind:value={base_font_pt} /> pt
  </label>

  <label
    >LH
    <input type="number" min="0.5" step="0.1" bind:value={line_height} />
  </label>

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
