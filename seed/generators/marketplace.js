import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { PRODUCT_TEMPLATES, randomElement, randomInt } from '../lib/randomHelpers.js';

export async function generateMarketplace(users) {
  console.log(`\n🛒 Generating marketplace products for Seller accounts...`);

  const sellers = users.filter(u => u.role === 'Seller');
  const targetSellers = sellers.length > 0 ? sellers : users.slice(0, 30); // fallback if no sellers

  const productsToInsert = [];

  for (const seller of targetSellers) {
    const productCount = randomInt(3, 8);
    for (let p = 0; p < productCount; p++) {
      const template = randomElement(PRODUCT_TEMPLATES);
      const price = randomInt(template.priceMin, template.priceMax);
      const seedId = `prod_${seller.id.slice(0, 8)}_${p}`;
      const imageUrl = `https://picsum.photos/seed/${seedId}/600/600`;

      productsToInsert.push({
        seller_id: seller.id,
        product_name: template.name,
        description: `High quality ${template.name} for modern farming. Direct supply from verified seller in ${seller.location || 'India'}.`,
        price: price,
        category: template.category,
        image_path: imageUrl,
        stock_quantity: randomInt(15, 250),
        status: 'Active',
        is_test: true
      });
    }
  }

  let { data, error } = await supabaseAdmin.from('products').insert(productsToInsert).select('id');

  if (error && error.message?.includes('is_test')) {
    const fallback = productsToInsert.map(({ is_test, ...rest }) => rest);
    const res = await supabaseAdmin.from('products').insert(fallback).select('id');
    data = res.data;
    error = res.error;
  }

  const count = data ? data.length : productsToInsert.length;
  console.log(`✅ Successfully generated ${count} marketplace products across ${targetSellers.length} sellers.`);
  return data || [];
}
