/**
 * Indian Agricultural Helper Pools & Random Utilities
 */

export const INDIAN_LOCATIONS = [
  'Ludhiana, Punjab', 'Jalandhar, Punjab', 'Amritsar, Punjab', 'Bathinda, Punjab', 'Patiala, Punjab',
  'Wayanad, Kerala', 'Palakkad, Kerala', 'Idukki, Kerala', 'Kottayam, Kerala', 'Thrissur, Kerala',
  'Nashik, Maharashtra', 'Pune, Maharashtra', 'Nagpur, Maharashtra', 'Solapur, Maharashtra', 'Kolhapur, Maharashtra',
  'Mandya, Karnataka', 'Shimoga, Karnataka', 'Hassan, Karnataka', 'Belagavi, Karnataka', 'Davanagere, Karnataka',
  'Varanasi, Uttar Pradesh', 'Bareilly, Uttar Pradesh', 'Aligarh, Uttar Pradesh', 'Gorakhpur, Uttar Pradesh', 'Meerut, Uttar Pradesh',
  'Coimbatore, Tamil Nadu', 'Madurai, Tamil Nadu', 'Salem, Tamil Nadu', 'Thanjavur, Tamil Nadu', 'Erode, Tamil Nadu',
  'Rajkot, Gujarat', 'Anand, Gujarat', 'Junagadh, Gujarat', 'Surat, Gujarat', 'Vadodara, Gujarat',
  'Karnal, Haryana', 'Ambala, Haryana', 'Hisar, Haryana', 'Rohtak, Haryana', 'Sirsa, Haryana',
  'Guntur, Andhra Pradesh', 'Krishna, Andhra Pradesh', 'East Godavari, Andhra Pradesh', 'Anantapur, Andhra Pradesh'
];

export const CROPS = [
  'Basmati Rice', 'Wheat', 'Sugarcane', 'BT Cotton', 'Tomato', 'Green Chili', 'Banana',
  'Coconut', 'Tea', 'Coffee', 'Maize', 'Potato', 'Mustard', 'Soybean', 'Red Onion',
  'Groundnut', 'Turmeric', 'Cardamom', 'Pepper', 'Mango', 'Pomegranate'
];

export const SYMPTOMS = [
  'yellowing leaves', 'leaf curl virus', 'stem borer damage', 'powdery mildew infestation',
  'root rot after heavy rain', 'early wilting', 'black spots on fruits', 'aphid swarm',
  'rust fungus patches', 'stunted crop growth', 'nitrogen deficiency symptoms'
];

export const TECHNIQUES = [
  'drip irrigation', 'vermicomposting', 'crop rotation', 'organic neem pesticide spray',
  'mulching with paddy straw', 'solar powered pump system', 'raised bed planting',
  'bio-fertilizer enrichment', 'zero-budget natural farming (ZBNF)', 'hydroponics setup'
];

export const WEATHER_CONDITIONS = [
  'sunny and clear', 'moderate monsoon rains', 'high humidity', 'heavy monsoon downpour',
  'cool morning mist', 'dry summer heatwave', 'pleasant seasonal breeze'
];

export const SENTIMENTS = [
  'looking healthier than ever!', 'exceeding expected yield targets.',
  'showing great improvement after treatment.', 'ready for harvest next week!',
  'fetching great market price this season.'
];

export const EXPERT_SPECIALIZATIONS = [
  'Soil Health & Nutrition',
  'Pest & Disease Control',
  'Organic Farming & Bio-Inputs',
  'Micro-Irrigation & Water Management',
  'Horticulture & Greenhouse Crops',
  'Post-Harvest & Storage'
];

export const PRODUCT_TEMPLATES = [
  { name: 'Premium Vermicompost Bio-Fertilizer (50kg)', category: 'Fertilizers', priceMin: 450, priceMax: 650 },
  { name: 'Cold-Pressed Pure Neem Oil Pesticide (1L)', category: 'Pesticides', priceMin: 320, priceMax: 480 },
  { name: 'Automatic Drip Irrigation Line Kit (1 Acre)', category: 'Irrigation', priceMin: 4500, priceMax: 8500 },
  { name: 'Certified High-Yield Basmati Seeds (10kg)', category: 'Seeds', priceMin: 850, priceMax: 1200 },
  { name: 'Trichoderma Viride Bio-Fungicide (1kg)', category: 'Pesticides', priceMin: 280, priceMax: 420 },
  { name: '16L Battery Operated Knapsack Sprayer', category: 'Tools & Machinery', priceMin: 2400, priceMax: 3600 },
  { name: 'Granular Bio-NPK Growth Promoter (25kg)', category: 'Fertilizers', priceMin: 750, priceMax: 1100 },
  { name: 'Yellow Sticky Traps for Insects (Pack of 25)', category: 'Pest Control', priceMin: 180, priceMax: 290 },
  { name: '3-in-1 Soil pH, Moisture & Light Meter', category: 'Tools & Machinery', priceMin: 550, priceMax: 950 },
  { name: 'Hybrid Wheat Seeds HD-3086 (40kg)', category: 'Seeds', priceMin: 1400, priceMax: 1900 },
  { name: 'Compressed Coco Peat Block (5kg / 75L)', category: 'Soil Prep', priceMin: 220, priceMax: 350 },
  { name: 'Organic Panchagavya Growth Tonic (1L)', category: 'Fertilizers', priceMin: 390, priceMax: 550 }
];

export function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomDate(startDaysAgo = 90, endDaysAgo = 0) {
  const now = new Date();
  const start = new Date(now.getTime() - startDaysAgo * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() - endDaysAgo * 24 * 60 * 60 * 1000);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
}

export function shuffleArray(arr) {
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
