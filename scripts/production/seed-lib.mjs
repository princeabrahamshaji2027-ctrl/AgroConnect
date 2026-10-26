// Initial community for the AgroConnect launch (owner decision 2026-10-26): synthetic demo profiles across the three
// launch districts, recorded as synthetic in their auth metadata and in seed/manifests/community-2026-10.json.
// Pure data + planning helpers (no network) so the plan can be checked offline and in unit tests.

export const SEED_TAG = 'community-2026-10';
export const EMAIL_DOMAIN = 'community.agroconnect.local';   // reserved .local name: cannot belong to a real person
export const DISTRICTS = ['Kottayam', 'Pathanamthitta', 'Kannur'];
const TOWNS = {
  Kottayam: ['Pala', 'Changanassery', 'Vaikom', 'Ettumanoor'],
  Pathanamthitta: ['Adoor', 'Thiruvalla', 'Ranni', 'Konni'],
  Kannur: ['Thalassery', 'Payyanur', 'Iritty', 'Taliparamba'],
};

export const EXPERTS = [
  { name: 'Dr. Thomas Kurian', district: 'Kottayam', specialization: 'Paddy and rice cultivation', feePaise: 40000 },
  { name: 'Dr. Asha Varghese', district: 'Kottayam', specialization: 'Rubber and spices', feePaise: 45000 },
  { name: 'Dr. Rajesh Pillai', district: 'Pathanamthitta', specialization: 'Banana and plantain', feePaise: 35000 },
  { name: 'Dr. Meera Nair', district: 'Pathanamthitta', specialization: 'Vegetables and organic farming', feePaise: 30000 },
  { name: 'Dr. Sreejith Nambiar', district: 'Kannur', specialization: 'Coconut and arecanut', feePaise: 50000 },
  { name: 'Dr. Lakshmi Menon', district: 'Kannur', specialization: 'Pepper and cardamom', feePaise: 60000 },
];

const FARMER_NAMES = ['Arun Mathew', 'Anjali Joseph', 'Amal George', 'Neethu Thomas', 'Jibin Varghese', 'Reshma Philip',
  'Biju Kuriakose', 'Sneha Abraham', 'Vishnu Prasad', 'Divya Raj', 'Tony Chacko', 'Aswathy Mohan', 'Rahul Krishnan',
  'Ancy Babu', 'Jithin Jose', 'Liya Mariam', 'Sajeev Kumar', 'Nimmy Paul', 'Abhijith Sasi', 'Merin Sebastian',
  'Shibu Antony', 'Athira Suresh', 'Joel Varghese', 'Sandra Thampi', 'Midhun Raj', 'Revathy Unni', 'Nithin Paul',
  'Gopika Ajith', 'Ajay Vinod', 'Haritha Das', 'Sachin Balan', 'Fathima Rasheed', 'Rohit Nambiar', 'Ameena Kabeer',
  'Kiran Dev'];
// districts round-robin: Kottayam, Pathanamthitta, Kannur → 12 / 12 / 11
export const FARMERS = FARMER_NAMES.map((name, i) => ({ name, district: DISTRICTS[i % 3] }));

export const slugOf = (name) => name.toLowerCase().replace(/^dr\.\s*/, 'dr-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const emailOf = (name) => `seed.${slugOf(name)}@${EMAIL_DOMAIN}`;

export function accounts() {
  const town = (d, i) => TOWNS[d][i % TOWNS[d].length];
  return [
    ...EXPERTS.map((e, i) => ({ ...e, role: 'Expert', slug: slugOf(e.name), email: emailOf(e.name),
      location: `${town(e.district, i)}, ${e.district}, Kerala`,
      bio: `${e.specialization}. (AgroConnect community demo profile)` })),
    ...FARMERS.map((f, i) => ({ ...f, role: 'Farmer', slug: slugOf(f.name), email: emailOf(f.name),
      location: `${town(f.district, Math.floor(i / 3))}, ${f.district}, Kerala`, bio: '' })),
  ];
}

// Starter posts (text only). Each author lives in the post's district.
export const POSTS = [
  { author: 'Arun Mathew', category: 'General', title: 'Paddy fields after the October rains',
    text: 'Water has stayed in our paddy field for four days after the rain. Has anyone tried draining in stages for the second crop, or is it better to wait? Sharing what worked for you would help a lot.' },
  { author: 'Jibin Varghese', category: 'Pest Control', title: 'Banana leaves with yellow streaks',
    text: 'Some of my Nendran plants have yellow streaks on the younger leaves. Before I spray anything, how do you tell a nutrient problem from a virus? Photos to follow.' },
  { author: 'Amal George', category: 'Organic Farming', title: 'Pepper vines and quick wilt this season',
    text: 'Planning to add trichoderma-enriched compost around the pepper vines before the dry spell. Anyone in Kannur doing this — how often do you apply it?' },
  { author: 'Neethu Thomas', category: 'Market Prices', title: 'Where do you sell vegetables in Kottayam town?',
    text: 'Our small kitchen-garden surplus (beans, okra, chilli) goes to waste some weeks. Which local markets or groups take small quantities?' },
  { author: 'Anjali Joseph', category: 'General', title: 'Starting a small rubber + intercrop plot',
    text: 'Replanting two acres this year. Has anyone grown pineapple or banana as an intercrop for the first three years? What spacing did you use?' },
];
export const captionOf = (p) => `${p.title}\n\n${p.text}`;   // same shape the app's Create Post stores

// existing: [{ email, role, district, synthetic }] — everything already in the project
export function plan(existing, { target = 50 } = {}) {
  const byEmail = new Set(existing.map((u) => (u.email || '').toLowerCase()));
  const names = new Map(existing.map((u) => [(u.full_name || '').toLowerCase(), u]));
  const all = accounts();
  const toCreate = all.filter((a) => !byEmail.has(a.email));
  const alreadySeeded = all.filter((a) => byEmail.has(a.email));
  const nameClashes = toCreate.filter((a) => names.has(a.name.toLowerCase())).map((a) => a.name);
  const retained = existing.filter((u) => !(u.email || '').toLowerCase().endsWith(`@${EMAIL_DOMAIN}`));
  const count = (list, role, d) => list.filter((x) => x.role === role && (d === undefined || x.district === d)).length;
  const finalList = [...retained.map((u) => ({ role: u.role, district: u.district || null })), ...all.map((a) => ({ role: a.role, district: a.district }))];
  const totals = {};
  for (const role of ['Admin', 'Expert', 'Farmer']) {
    totals[role] = { total: count(finalList, role) };
    for (const d of [...DISTRICTS, null]) totals[role][d ?? 'not set'] = count(finalList, role, d);
  }
  return { toCreate, alreadySeeded, nameClashes, retainedCount: retained.length, finalCount: finalList.length, target, totals };
}
