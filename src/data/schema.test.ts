import { describe, expect, it } from 'vitest';
import { AppSchema } from './schema';

describe('PowerSync application schema', () => {
  it('validates every table and index with the installed PowerSync SDK', () => {
    const failures: string[] = [];
    for (const table of AppSchema.tables) {
      try { table.validate(); }
      catch (cause) { failures.push(`${table.name}: ${cause instanceof Error ? cause.message : String(cause)}`); }
    }
    expect(failures).toEqual([]);
    expect(() => AppSchema.validate()).not.toThrow();
  });
});
