import { describe, expect, it } from 'vitest';
import { escapeCell, renderTable } from '../../src/render/markdown/table.js';

describe('renderTable', () => {
  it('renders an aligned table', () => {
    const table = renderTable(
      [
        { header: 'Attribute' },
        { header: 'Type', align: 'center' },
        { header: 'Required', align: 'right' },
      ],
      [
        ['email', 'string', 'yes'],
        ['age', 'number', 'no'],
      ],
    );
    expect(table).toMatchSnapshot();
  });

  it('fills missing trailing cells with empty', () => {
    const table = renderTable([{ header: 'A' }, { header: 'B' }], [['only-a']]);
    expect(table).toBe('| A | B |\n| --- | --- |\n| only-a |  |');
  });

  it('throws when a row has more cells than columns', () => {
    expect(() => renderTable([{ header: 'A' }], [['x', 'y']])).toThrow();
  });
});

describe('escapeCell', () => {
  it('escapes pipes', () => {
    expect(escapeCell('a|b')).toBe('a\\|b');
  });

  it('replaces newlines with <br>', () => {
    expect(escapeCell('line1\nline2')).toBe('line1<br>line2');
  });

  it('trims surrounding whitespace', () => {
    expect(escapeCell('  x  ')).toBe('x');
  });

  it('handles empty', () => {
    expect(escapeCell('')).toBe('');
  });
});
