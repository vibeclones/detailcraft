/* SPDX-License-Identifier: Apache-2.0 */
/**
 * csv.js — CSV text for the bill of materials and the bending schedule. No DOM.
 * RFC 4180 quoting, CRLF line ends; the UI prepends a byte-order mark so spreadsheet programs read UTF-8.
 * Cells that start with = + - @ (and are not plain numbers) get a leading ' so a spreadsheet never runs them.
 */
export function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** One table → CSV. */
export function toCsv(rows) { return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'; }
/** Several titled tables in one file, a blank line between. */
export function sectionsCsv(sections) {
  return sections.map(([title, rows]) => toCsv([[title], ...rows])).join('\r\n');
}
/** Minimal reader (tests): handles quotes, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
