import { tick } from "svelte";
import {
  export_images_for_markdown,
  import_images_from_map,
} from "./images.js";

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
    __version: 2,
    savedAt: new Date().toISOString(),
    ...state,
  };
}

export async function export_book(state) {
  const assets = await export_images_for_markdown(state.markdown);

  const data = snapshot_state({
    ...state,
    assets,
  });

  download_json(`${slugify(state.title)}.zine.json`, data);
}

export function apply_state(s, setters) {
  if (!s) return;

  setters.title(s.title);
  setters.page_size(s.page_size);
  setters.margins(s.margins);
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

  setters.markdown(s.markdown);
}

export async function import_book_from_file(file, setters, rerender) {
  try {
    const txt = await file.text();
    const parsed = JSON.parse(txt);

    if (parsed.assets) {
      await import_images_from_map(parsed.assets);
    }

    apply_state(parsed, setters);

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
