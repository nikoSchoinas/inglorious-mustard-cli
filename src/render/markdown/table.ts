/**
 * GitHub-flavoured markdown table helpers. Rendered by hand (no lib) to keep the
 * output byte-stable and dependency-free, matching `frontmatter.ts`. Consumed by
 * the schema tables (M10) and stack tables (M11): "readable tables, never raw
 * JSON" (§8.6).
 */

export interface TableColumn {
  header: string;
  /** Column alignment; defaults to left. Drives the `:---` / `---:` / `:---:` row. */
  align?: 'left' | 'right' | 'center';
}

const DIVIDER: Record<NonNullable<TableColumn['align']>, string> = {
  left: '---',
  right: '---:',
  center: ':---:',
};

/** Escape a single cell so its content cannot break the table structure. */
export function escapeCell(raw: string): string {
  return raw
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, '<br>')
    .trim();
}

/**
 * Render a markdown table. Each row is an array of cell strings, one per column.
 * Missing trailing cells render empty; a row with more cells than columns is a
 * caller bug and throws.
 */
export function renderTable(
  columns: readonly TableColumn[],
  rows: ReadonlyArray<readonly string[]>,
): string {
  const header = `| ${columns.map((c) => escapeCell(c.header)).join(' | ')} |`;
  const divider = `| ${columns.map((c) => DIVIDER[c.align ?? 'left']).join(' | ')} |`;
  const body = rows.map((row) => {
    if (row.length > columns.length) {
      throw new Error(`Table row has ${row.length} cells but only ${columns.length} columns.`);
    }
    const cells = columns.map((_col, i) => escapeCell(row[i] ?? ''));
    return `| ${cells.join(' | ')} |`;
  });
  return [header, divider, ...body].join('\n');
}
