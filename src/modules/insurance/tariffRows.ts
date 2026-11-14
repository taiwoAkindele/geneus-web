import { formulaLike, type FeeItem, type PayerContractTerms, type TariffImportLine } from '@shared';
import { parseAmount } from '@/lib/money';
import type { FieldSpec, MappedRow } from '@/lib/tabular/mapping';
import { matchIndex, matchRecord, type Match } from '@/lib/tabular/matching';

/** What a tariff sheet can supply. Either the Geneus id (from our own template) or a service name is needed to match. */
export const TARIFF_FIELDS: FieldSpec[] = [
  { key: 'feeItemId', label: 'Geneus service id', synonyms: ['geneus id', 'geneus service id', 'fee item id', 'fee id'], help: 'Present in sheets downloaded from Geneus; matches exactly.' },
  { key: 'name', label: 'Service name', required: true, synonyms: ['service', 'service name', 'service description', 'description', 'item', 'item description', 'procedure', 'investigation', 'drug', 'drug name', 'tariff item', 'name'] },
  { key: 'payerCode', label: "Payer's service code", synonyms: ['code', 'service code', 'hmo code', 'tariff code', 'item code', 'procedure code', 'nhis code', 'payer code', "payer s code", 'nhia code'] },
  { key: 'price', label: 'Contract price', required: true, synonyms: ['price', 'tariff', 'amount', 'rate', 'cost', 'unit price', 'fee', 'tariff price', 'contract price', 'approved tariff', 'approved price', 'naira'] },
];

/** "₦1,500.00", "N 1500", "NGN1,500" → 150000 minor units. Negative, blank or over-precise amounts are refused. */
export const parsePrice = (value: string, currency: string): number => {
  const cleaned = value.trim().replace(/^(ngn|₦|n|usd|us\$|\$)\s*/i, '').replace(/\s*(ngn|₦|usd)$/i, '').replace(/[,\s]/g, '');
  if (!cleaned) throw new Error('No price');
  if (/^\(.*\)$|^-/.test(cleaned)) throw new Error('A price cannot be negative');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error(`"${value}" is not a price`);
  return parseAmount(cleaned, currency);
};

export type TariffRowStatus = 'ready' | 'needs_match' | 'error' | 'skipped';
export type TariffRow = {
  sourceRow: number;
  source: { name: string; code: string; price: string; id: string };
  match: Match;
  /** The fee item a person chose or confirmed; set automatically only for exact matches. */
  feeItemId?: string;
  price: string;
  include: boolean;
};
export type CheckedRow = TariffRow & { status: TariffRowStatus; problem?: string; unitMinor?: number; payerCode?: string; change?: 'new' | 'changed' | 'same' };

export const buildTariffRows = (rows: readonly MappedRow[], fees: readonly FeeItem[], tariff: PayerContractTerms['tariff'] = {}): TariffRow[] => {
  // Codes already recorded on the contract match their service exactly next time.
  const index = matchIndex(fees.map((f) => ({ id: f.id, name: f.name, codes: tariff[f.id]?.payerCode ? [tariff[f.id].payerCode!] : [] })));
  return rows.map((row) => {
    const source = { name: row.values.name ?? '', code: row.values.payerCode ?? '', price: row.values.price ?? '', id: row.values.feeItemId ?? '' };
    const match = matchRecord(index, { id: source.id, code: source.code, name: source.name });
    return { sourceRow: row.sourceRow, source, match, ...(match.kind === 'exact' ? { feeItemId: match.id } : {}), price: source.price, include: match.kind !== 'none' };
  });
};

/** Every row's state, recomputed after each edit. Two rows for one service: the later one is an error until resolved. */
export const checkTariffRows = (rows: readonly TariffRow[], fees: readonly FeeItem[], currency: string, tariff: PayerContractTerms['tariff'] = {}): CheckedRow[] => {
  const feeById = new Map(fees.map((f) => [f.id, f]));
  const firstRowFor = new Map<string, number>();
  return rows.map((row) => {
    if (!row.include) return { ...row, status: 'skipped' as const };
    if (!row.feeItemId) return { ...row, status: 'needs_match' as const, problem: row.match.kind === 'suggested' ? 'Confirm the matching service' : 'Choose the matching service, or skip this row' };
    const fee = feeById.get(row.feeItemId);
    if (!fee) return { ...row, status: 'error' as const, problem: 'This service is not available' };
    if (fee.currency !== currency) return { ...row, status: 'error' as const, problem: `The service is priced in ${fee.currency}, the contract in ${currency}` };
    const earlier = firstRowFor.get(row.feeItemId);
    if (earlier !== undefined) return { ...row, status: 'error' as const, problem: `Row ${earlier} already prices this service` };
    firstRowFor.set(row.feeItemId, row.sourceRow);
    let unitMinor: number;
    try { unitMinor = parsePrice(row.price, currency); } catch (cause) { return { ...row, status: 'error' as const, problem: cause instanceof Error ? cause.message : 'Check the price' }; }
    const code = row.source.code.trim();
    if (code && formulaLike(code)) return { ...row, status: 'error' as const, problem: 'The code starts with =, +, @ or a control character' };
    if (code.length > 60) return { ...row, status: 'error' as const, problem: 'The code is longer than 60 characters' };
    const previous = tariff[row.feeItemId];
    const payerCode = code || previous?.payerCode;
    const change = !previous ? 'new' as const : previous.unitMinor === unitMinor && previous.payerCode === payerCode ? 'same' as const : 'changed' as const;
    return { ...row, status: 'ready' as const, unitMinor, ...(code ? { payerCode: code } : {}), change };
  });
};

export const importLines = (rows: readonly CheckedRow[]): TariffImportLine[] =>
  rows.filter((r) => r.status === 'ready').map((r) => ({ feeItemId: r.feeItemId!, unitMinor: r.unitMinor!, sourceRow: r.sourceRow, ...(r.payerCode ? { payerCode: r.payerCode } : {}) }));
