import { tick } from "svelte";

export function slugify(s = "") {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "book"
  );
}

export function download_json(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function snapshot_state(state) {
  return {
    __type: "zine-book",
    __version: 1,
    savedAt: new Date().toISOString(),
    ...state,
  };
}

export function apply_state(s, setters) {
  if (!s || (s.__type && s.__type !== "zine-book")) return;

  setters.title(s.title);
  setters.page_size(s.page_size);
  setters.margins(s.margins);
  setters.markdown(s.markdown);
  setters.columns(Number(s.columns));
  setters.column_gap(Number(s.column_gap));
  setters.font_family(s.font_family);
  setters.base_font_pt(Number(s.base_font_pt));
  setters.line_height(Number(s.line_height));
  setters.justify(s.justify);
  setters.hyphens(s.hyphens);
  setters.print_mode(s.print_mode);
  setters.spread_gutter(Number(s.spread_gutter));

  if (typeof s.left_percent === "number") {
    setters.left_percent(Math.max(20, Math.min(80, s.left_percent)));
  }
}

export function export_book(state) {
  const data = snapshot_state(state);
  download_json(`${slugify(state.title)}.zine.json`, data);
}

export async function import_book_from_file(file, setters, rerender) {
  try {
    const txt = await file.text();
    const parsed = JSON.parse(txt);

    const s = parsed && parsed.__type === "zine-book" ? parsed : parsed;
    apply_state(s, setters);

    await tick();
    await rerender();
  } catch (err) {
    console.error(err);
    alert("Import failed: invalid or corrupted file.");
  } finally {
    const el = document.getElementById("import_book");
    if (el) el.value = "";
  }
}
