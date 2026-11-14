export function caseCsv(headers, rows) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]|^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + [headers, ...rows]
    .map((row) => row.map(cell).join(",")).join("\r\n");
}
