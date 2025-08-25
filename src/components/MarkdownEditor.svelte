<script>
  export let markdown;
  export let storage_text = "";
  export let pages_len = 0;
  export let columns = 1;

  export let on_paste = () => {};
  export let on_drop = () => {};
  export let prevent = (e) => e.preventDefault();

  export let taEl;
</script>

<section class="left" on:dragover|preventDefault={prevent} on:drop={on_drop}>
  <div class="editor">
    <div class="header">
      <div>Markdown</div>
      <div class="meta">{pages_len} pages · {columns} col</div>
      <div class="storage-indicator">{storage_text}</div>
    </div>

    <textarea
      bind:value={markdown}
      bind:this={taEl}
      spellcheck="false"
      on:paste={on_paste}
    ></textarea>
  </div>
</section>
