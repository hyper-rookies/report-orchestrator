export function downloadCsv(
  rows: Record<string, unknown>[],
  filename = "data.csv"
): void {
  if (!rows.length) {
    return;
  }

  const headers = Object.keys(rows[0] ?? {});
  if (!headers.length) {
    return;
  }

  const escape = (value: unknown): string => {
    if (value == null) return '""';
    const str = String(value);
    if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r"))
      return '"' + str.replace(/"/g, '""') + '"';
    return str;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
