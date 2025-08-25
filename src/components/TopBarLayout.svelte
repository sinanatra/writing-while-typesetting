<script>
  export let title;
  export let page_sizes;
  export let page_size;
  export let margins;
  export let columns;
  export let column_gap;

  const resetMargins = () => {
    if (!page_sizes || !page_size) return;
    margins = { ...page_sizes[page_size].margins };
  };
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

    <button on:click={resetMargins}>Reset margins</button>
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
</div>
