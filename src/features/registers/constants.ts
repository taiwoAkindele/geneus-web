import type { FieldType } from './types';

/** Field "kind" groups types by how they render (input / choice / toggle / section). */
export type FieldKind = 'input' | 'choice' | 'toggle' | 'section';

export type FieldTypeDef = { type: FieldType; label: string; glyph: string; kind: FieldKind };

export const FIELD_TYPES: FieldTypeDef[] = [
  { type: 'text', label: 'Short text', glyph: 'Ab', kind: 'input' },
  { type: 'textarea', label: 'Paragraph', glyph: '¶', kind: 'input' },
  { type: 'number', label: 'Number', glyph: '#', kind: 'input' },
  { type: 'date', label: 'Date', glyph: '📅', kind: 'input' },
  { type: 'phone', label: 'Phone', glyph: '☎', kind: 'input' },
  { type: 'select', label: 'Single choice', glyph: '◉', kind: 'choice' },
  { type: 'multiselect', label: 'Multiple choice', glyph: '☑', kind: 'choice' },
  { type: 'checkbox', label: 'Yes / No', glyph: '✓', kind: 'toggle' },
  { type: 'section', label: 'Section heading', glyph: '§', kind: 'section' },
];

export const CATEGORIES = ['Maternal', 'Child health', 'Disease', 'General', 'Pharmacy'];

export const PLACEHOLDERS: Partial<Record<FieldType, string>> = {
  text: 'Type here…',
  textarea: 'Type here…',
  number: '0',
  date: 'dd / mm / yyyy',
  phone: '080 0000 0000',
};

/** HTML input type for single-line inputs. */
export const INPUT_TYPE: Partial<Record<FieldType, string>> = { text: 'text', number: 'number', phone: 'tel', date: 'date' };

/** Category → [background, foreground] for the little register icon tile. */
export const CATEGORY_COLORS: Record<string, [string, string]> = {
  Maternal: ['#f3e0ef', '#8a2b78'],
  'Child health': ['#dcefe2', '#00502e'],
  Disease: ['#ffe4e0', '#93000a'],
  General: ['#e6ecff', '#1b3a8f'],
  Pharmacy: ['#fdeecb', '#7a4f00'],
};

export const typeDef = (type: FieldType): FieldTypeDef => FIELD_TYPES.find((t) => t.type === type) ?? FIELD_TYPES[0];
export const isChoice = (type: FieldType): boolean => type === 'select' || type === 'multiselect';

/** Deterministic id generator (avoids Math.random for stable keys). */
let seq = 0;
export const uid = (prefix: string): string => `${prefix}-${seq++}`;

/** Two-letter monogram from a register name, for the icon tile. */
export const monogram = (name: string): string => name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'RG';
