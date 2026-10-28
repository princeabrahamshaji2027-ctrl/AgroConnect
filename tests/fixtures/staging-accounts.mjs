// Display names of the staging test accounts (single source: staging-accounts.json).
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./staging-accounts.json', import.meta.url), 'utf8'));
export const NAMES = Object.fromEntries(Object.entries(data.accounts).map(([k, v]) => [k, v.name]));
export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // for building RegExps from a name
