import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { CROPS, INDIAN_LOCATIONS, TECHNIQUES, SYMPTOMS, WEATHER_CONDITIONS, SENTIMENTS, randomElement, randomDate } from '../lib/randomHelpers.js';

const POST_TEMPLATES = [
  {
    title: "🌾 Harvest Update from {location}",
    caption: "Our {crop} harvest is looking great this season in {location}! {sentiment} Sharing some field pictures with fellow farmers."
  },
  {
    title: "Need expert advice on {crop} symptoms",
    caption: "Seeking advice from agricultural experts — my {crop} leaves are showing {symptom}. Any recommended organic treatment or spray?"
  },
  {
    title: "Results after applying {technique}",
    caption: "Just tried {technique} on my farm in {location} and the results are {sentiment} Would highly recommend this to fellow farmers."
  },
  {
    title: "Fresh {crop} available directly from farm",
    caption: "Harvesting fresh high-quality {crop} in {location}. Direct farm sale available at fair market prices. Message for quantity details."
  },
  {
    title: "Weather update and crop conditions",
    caption: "Weather has been {weather} this week in {location}. How is everyone's {crop} crop holding up?"
  },
  {
    title: "Workshop key takeaways on {technique}",
    caption: "Attended a regional agricultural workshop on {technique} today. Learned valuable tips on soil health and water conservation."
  },
  {
    title: "Drip irrigation setup experience",
    caption: "Completed installing a new {technique} system for our {crop} fields in {location}. Water savings are noticeable already!"
  },
  {
    title: "Pest control experience sharing",
    caption: "Managed to control {symptom} on our {crop} using natural bio-inputs. Happy to share the step-by-step process."
  },
  {
    title: "Community farming update",
    caption: "Great discussions with local farmers in {location} today about sustainable cultivation of {crop}. Together we grow stronger!"
  },
  {
    title: "Organic farming transition report",
    caption: "Third season practicing organic farming for {crop} in {location}. Soil organic matter is up and crop quality is {sentiment}"
  }
];

export async function generatePosts(users, targetCount = 6000) {
  console.log(`\n🌾 Generating ${targetCount} agricultural posts...`);

  if (!users || users.length === 0) {
    console.error('No users available for post generation!');
    return [];
  }

  const createdPosts = [];
  const BATCH_SIZE = 500;
  const totalBatches = Math.ceil(targetCount / BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const currentBatchSize = Math.min(BATCH_SIZE, targetCount - batchIdx * BATCH_SIZE);
    const postBatch = [];

    for (let i = 0; i < currentBatchSize; i++) {
      const author = randomElement(users);
      const template = randomElement(POST_TEMPLATES);

      const crop = randomElement(CROPS);
      const location = author.location || randomElement(INDIAN_LOCATIONS);
      const technique = randomElement(TECHNIQUES);
      const symptom = randomElement(SYMPTOMS);
      const weather = randomElement(WEATHER_CONDITIONS);
      const sentiment = randomElement(SENTIMENTS);

      const title = template.title
        .replace('{crop}', crop)
        .replace('{location}', location)
        .replace('{technique}', technique)
        .replace('{symptom}', symptom);

      const caption = template.caption
        .replace(/{crop}/g, crop)
        .replace(/{location}/g, location)
        .replace(/{technique}/g, technique)
        .replace(/{symptom}/g, symptom)
        .replace(/{weather}/g, weather)
        .replace(/{sentiment}/g, sentiment);

      const seedId = `post_${batchIdx}_${i}_${author.id.slice(0, 8)}`;
      const imageUrl = `https://picsum.photos/seed/${seedId}/800/600`;

      postBatch.push({
        user_id: author.id,
        title: title,
        caption: caption,
        image_path: imageUrl,
        status: 'Approved',
        created_at: randomDate(90, 0),
        is_test: true
      });
    }

    // Try batch insert with is_test, fallback without if column missing
    let { data, error } = await supabaseAdmin.from('posts').insert(postBatch).select('id, user_id, created_at');

    if (error && error.message?.includes('is_test')) {
      const fallbackBatch = postBatch.map(({ is_test, ...rest }) => rest);
      const res = await supabaseAdmin.from('posts').insert(fallbackBatch).select('id, user_id, created_at');
      data = res.data;
      error = res.error;
    }

    if (error) {
      console.error(`   Error inserting post batch ${batchIdx + 1}:`, error.message);
    } else if (data) {
      createdPosts.push(...data);
    }

    console.log(`   Progress: ${Math.min((batchIdx + 1) * BATCH_SIZE, targetCount)} / ${targetCount} posts created...`);
  }

  console.log(`✅ Successfully generated ${createdPosts.length} posts.`);
  return createdPosts;
}
