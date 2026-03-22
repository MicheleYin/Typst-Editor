/** Append `.typ` only when the leaf name has no extension (any explicit extension is kept). */
export function ensureDefaultTypstExtension(fileName: string): string {
  const leaf = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = leaf.lastIndexOf(".");
  if (dot > 0 && dot < leaf.length - 1) return fileName;
  return fileName.toLowerCase().endsWith(".typ") ? fileName : `${fileName}.typ`;
}

/** If `fileName` is already taken, return `stem-2.ext`, `stem-3.ext`, … preserving extension. */
export function nextNonCollidingFileName(fileName: string, nameSet: Set<string>): string {
  if (!nameSet.has(fileName)) return fileName;
  const leaf = fileName.split(/[/\\]/).pop() ?? fileName;
  const lastDot = leaf.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < leaf.length - 1;
  const stem = hasExt ? leaf.slice(0, lastDot) : leaf;
  const ext = hasExt ? leaf.slice(lastDot) : ".typ";
  let n = 2;
  while (nameSet.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
}
