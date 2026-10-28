// Initial community for the AgroConnect launch (owner decisions 2026-10-26 and 2026-10-27): 50 synthetic demo
// profiles across the four launch districts — Kannur 20, Pathanamthitta 20, Idukki 5, Kottayam 5 — of which 10 are
// experts. Recorded as synthetic in their auth metadata and in seed/manifests/community-2026-10.json. Existing accounts
// are never changed (and never given a district). Pure data + planning helpers (no network), checked by unit tests.

export const SEED_TAG = 'community-2026-10';
export const EMAIL_DOMAIN = 'community.agroconnect.local';   // reserved .local name: cannot belong to a real person
export const DISTRICTS = ['Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam'];
export const TARGET = { Kannur: 20, Pathanamthitta: 20, Idukki: 5, Kottayam: 5 };   // users per district (experts included)
const TOWNS = {
  Kannur: ['Thalassery', 'Payyanur', 'Iritty', 'Taliparamba'],
  Pathanamthitta: ['Adoor', 'Thiruvalla', 'Ranni', 'Konni'],
  Idukki: ['Thodupuzha', 'Kattappana', 'Munnar', 'Adimali'],
  Kottayam: ['Pala', 'Changanassery', 'Vaikom', 'Ettumanoor'],
};

// 10 experts: Kannur 4, Pathanamthitta 4, Idukki 1, Kottayam 1. Fees in paise (₹300–₹600). No "Dr." titles: these are
// synthetic profiles and must not present a qualification (their resumes say "DEMO DOCUMENT - NOT A REAL QUALIFICATION").
export const EXPERTS = [
  { name: 'Sreejith Nambiar', district: 'Kannur', specialization: 'Coconut and arecanut', feePaise: 50000 },
  { name: 'Lakshmi Menon', district: 'Kannur', specialization: 'Pepper and cardamom', feePaise: 60000 },
  { name: 'Arjun Kannoth', district: 'Kannur', specialization: 'Cashew and mango orchards', feePaise: 45000 },
  { name: 'Swathi Kunhiraman', district: 'Kannur', specialization: 'Soil health and composting', feePaise: 40000 },
  { name: 'Rajesh Pillai', district: 'Pathanamthitta', specialization: 'Banana and plantain', feePaise: 35000 },
  { name: 'Meera Nair', district: 'Pathanamthitta', specialization: 'Vegetables and organic farming', feePaise: 30000 },
  { name: 'Vinod Mathew', district: 'Pathanamthitta', specialization: 'Rubber plantations', feePaise: 50000 },
  { name: 'Priya Oommen', district: 'Pathanamthitta', specialization: 'Tuber crops and tapioca', feePaise: 35000 },
  { name: 'Asha Varghese', district: 'Idukki', specialization: 'Cardamom, tea and spices', feePaise: 45000 },
  { name: 'Thomas Kurian', district: 'Kottayam', specialization: 'Paddy and rice cultivation', feePaise: 40000 },
];

// 40 farmers by explicit district (no round-robin): Kannur 16, Pathanamthitta 16, Idukki 4, Kottayam 4.
const FARMERS_BY_DISTRICT = {
  Kannur: ['Amal George', 'Reshma Philip', 'Vishnu Prasad', 'Aswathy Mohan', 'Jithin Jose', 'Nimmy Paul', 'Shibu Antony',
    'Sandra Thampi', 'Nithin Paul', 'Haritha Das', 'Rohit Nambiar', 'Kiran Dev', 'Sachin Balan', 'Fathima Rasheed',
    'Ameena Kabeer', 'Akhil Kannan'],
  Pathanamthitta: ['Jibin Varghese', 'Anjali Joseph', 'Biju Kuriakose', 'Divya Raj', 'Rahul Krishnan', 'Liya Mariam',
    'Abhijith Sasi', 'Athira Suresh', 'Midhun Raj', 'Gopika Ajith', 'Ajay Vinod', 'Merin Sebastian', 'Tony Chacko',
    'Ancy Babu', 'Sajeev Kumar', 'Revathy Unni'],
  Idukki: ['Joel Varghese', 'Sneha Abraham', 'Binoy Thomas', 'Ann Maria Jose'],
  Kottayam: ['Arun Mathew', 'Neethu Thomas', 'Jomon Kurian', 'Sherin Philip'],
};
export const FARMERS = DISTRICTS.flatMap((district) => FARMERS_BY_DISTRICT[district].map((name) => ({ name, district })));

export const slugOf = (name) => name.toLowerCase().replace(/^dr\.\s*/, 'dr-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const emailOf = (name) => `seed.${slugOf(name)}@${EMAIL_DOMAIN}`;

export function accounts() {
  const town = (d, i) => TOWNS[d][i % TOWNS[d].length];
  return [
    ...EXPERTS.map((e, i) => ({ ...e, role: 'Expert', slug: slugOf(e.name), email: emailOf(e.name),
      location: `${town(e.district, i)}, ${e.district}, Kerala`,
      bio: `${e.specialization}. (AgroConnect community demo profile)` })),
    ...FARMERS.map((f) => ({ ...f, role: 'Farmer', slug: slugOf(f.name), email: emailOf(f.name),
      location: `${town(f.district, FARMERS_BY_DISTRICT[f.district].indexOf(f.name))}, ${f.district}, Kerala`, bio: '' })),
  ];
}

// Starter posts (text only), two per district; each author lives in the post's district. Synthetic questions only:
// no diagnoses, testimonials or claims about real people.
export const POSTS = [
  { author: 'Amal George', category: 'Organic Farming', title: 'Pepper vines and quick wilt this season',
    text: 'Planning to add trichoderma-enriched compost around the pepper vines before the dry spell. Anyone in Kannur doing this — how often do you apply it?' },
  { author: 'Reshma Philip', category: 'General', title: 'Coconut climbers in Thalassery',
    text: 'Our regular coconut climber has moved away. How are others in the area arranging harvesting now — groups, machines, or the Krishi Bhavan list?' },
  { author: 'Jibin Varghese', category: 'Pest Control', title: 'Banana leaves with yellow streaks',
    text: 'Some of my Nendran plants have yellow streaks on the younger leaves. Before I spray anything, how do you tell a nutrient problem from a virus? Photos to follow.' },
  { author: 'Anjali Joseph', category: 'General', title: 'Starting a small rubber + intercrop plot',
    text: 'Replanting two acres this year. Has anyone grown pineapple or banana as an intercrop for the first three years? What spacing did you use?' },
  { author: 'Joel Varghese', category: 'General', title: 'Cardamom drying in the rain',
    text: 'With the rain continuing in Kattappana, drying cardamom evenly is hard. Do small growers here share a dryer, or is there a better way for a small harvest?' },
  { author: 'Sneha Abraham', category: 'Market Prices', title: 'Selling tea leaf in small quantities',
    text: 'We pluck from a small garden near Munnar. Which collection centres take small daily quantities, and how often do they pay?' },
  { author: 'Arun Mathew', category: 'General', title: 'Paddy fields after the October rains',
    text: 'Water has stayed in our paddy field for four days after the rain. Has anyone tried draining in stages for the second crop, or is it better to wait? Sharing what worked for you would help a lot.' },
  { author: 'Neethu Thomas', category: 'Market Prices', title: 'Where do you sell vegetables in Kottayam town?',
    text: 'Our small kitchen-garden surplus (beans, okra, chilli) goes to waste some weeks. Which local markets or groups take small quantities?' },
];
export const captionOf = (p) => `${p.title}\n\n${p.text}`;   // same shape the app's Create Post stores

// existing: [{ email, role, district, synthetic }] — everything already in the project
export function plan(existing, { target = Object.values(TARGET).reduce((a, b) => a + b, 0) } = {}) {
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
