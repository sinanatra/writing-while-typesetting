// src/lib/formats.js
export const page_sizes = {
  A7: {
    id: "A7",
    label: "A7 (74×105mm)",
    w: 74,
    h: 105,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
  },
  A6: {
    id: "A6",
    label: "A6 (105×148mm)",
    w: 105,
    h: 148,
    margins: { top: 15, right: 12, bottom: 15, left: 12 },
  },
  A5: {
    id: "A5",
    label: "A5 (148×210mm)",
    w: 148,
    h: 210,
    margins: { top: 20, right: 15, bottom: 20, left: 15 },
  },
  A4: {
    id: "A4",
    label: "A4 (210×297mm)",
    w: 210,
    h: 297,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
  },
  Letter: {
    id: "Letter",
    label: "Letter (216×279mm)",
    w: 216,
    h: 279,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
  },
};

export const px_per_mm = 96 / 25.4;

export function buildPrintCSS({ sizeId }) {
  const s = page_sizes[sizeId] ?? page_sizes.A5;
  const mm = (n) => `${n}mm`;

  return `
@media print {
  /* force exact paper size, no scaling and no default margins */
  @page { size: ${mm(s.w)} ${mm(s.h)}; margin: 0; }

  html, body { margin: 0; padding: 0; height: auto; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* hide app chrome; show only #print-root */
  .topbar, .workspace .left, .workspace .splitter, .spreads { display: none !important; }
  #print-root { display: block !important; }

  /* each page becomes its own printed page */
  #print-root .print-page {
    width: ${mm(s.w)} !important;
    height: ${mm(s.h)} !important;
    page-break-after: always;
    box-shadow: none !important;
    background: white;
  }
  #print-root .print-page:last-child { page-break-after: auto; }
}
`;
}
