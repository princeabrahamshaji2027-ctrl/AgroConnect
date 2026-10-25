// Amounts are integer paise (₹1 = 100 paise); shown in INR.
export const formatInr = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
