// Amounts are integer paise (₹1 = 100 paise); shown in INR. The database is the authority for every amount
// (experts.consultation_fee_paise, demo_payments snapshot — migration 15); these helpers only format and validate input.
export const formatInr = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);

export const FEE_MIN_PAISE = 100;        // ₹1         (same limits as set_consultation_fee())
export const FEE_MAX_PAISE = 10000000;   // ₹1,00,000
export const COMMISSION_BPS = 200;       // 2 % — mirror of platform_commission_bps(), for the expert's preview only

// "1,000.5" / "1000.50" → 100050 paise; anything else (empty, negative, NaN, Infinity, 3 decimals, out of range) → error.
// Parsed as text, never through floating point.
export function parseFeeInput(text) {
  const raw = String(text ?? '').replace(/[,\s₹]/g, '');
  if (!raw) return { error: 'Enter your consultation fee.' };
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!m) return { error: 'Enter a fee in rupees, for example 500 or 499.50.' };
  const paise = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  if (paise < FEE_MIN_PAISE || paise > FEE_MAX_PAISE) return { error: 'The consultation fee must be between ₹1 and ₹1,00,000.' };
  return { paise };
}

// Same rule as the database (_commission_paise): commission = round half up (fee × 2 %), expert share = fee − commission.
export function commissionSplit(feePaise, bps = COMMISSION_BPS) {
  const commission = Math.floor((feePaise * bps + 5000) / 10000);
  return { commission, share: feePaise - commission };
}
