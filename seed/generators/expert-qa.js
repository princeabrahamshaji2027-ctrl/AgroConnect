import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { CROPS, INDIAN_LOCATIONS, SYMPTOMS, randomElement, randomDate, randomInt } from '../lib/randomHelpers.js';

const EXPERT_QUESTION_TEMPLATES = [
  "Expert Consultation needed: Why are my {crop} leaves turning yellow in {location}?",
  "Urgent advice requested regarding {symptom} on {crop} crop.",
  "What is the ideal sowing window for {crop} in {location} region?",
  "How to manage {symptom} organically without chemical pesticides?",
  "Recommended fertilizer dosage for {crop} during flowering stage?"
];

const EXPERT_ANSWER_TEMPLATES = [
  "Hello farmer! Based on the symptoms described for {crop}, this indicates {symptom}. Recommend applying Neem Oil (5ml/L water) or Trichoderma Bio-fungicide.",
  "For {crop} in {location}, ensure adequate soil drainage. Avoid over-irrigation during early growth stages.",
  "Check soil pH first. A balanced NPK ratio (10:26:26) along with organic compost will improve foliage health significantly.",
  "This is a common issue this season. Use yellow sticky traps and spray bio-pesticide early in the morning for best results."
];

export async function generateExpertQA(users) {
  console.log(`\n👨‍🌾 Generating Expert Q&A consultations...`);

  const farmers = users.filter(u => u.role === 'Farmer');
  const experts = users.filter(u => u.role === 'Expert');

  if (farmers.length === 0 || experts.length === 0) {
    console.log('   Skipping Expert Q&A (requires both Farmers and Experts).');
    return [];
  }

  const qaPosts = [];
  const Q_COUNT = 80;

  for (let i = 0; i < Q_COUNT; i++) {
    const farmer = randomElement(farmers);
    const crop = randomElement(CROPS);
    const location = farmer.location || randomElement(INDIAN_LOCATIONS);
    const symptom = randomElement(SYMPTOMS);

    const title = `[Expert Q&A] Advice needed for ${crop}`;
    const template = randomElement(EXPERT_QUESTION_TEMPLATES);
    const caption = template.replace('{crop}', crop).replace('{location}', location).replace('{symptom}', symptom);
    const seedId = `qa_post_${i}_${farmer.id.slice(0, 6)}`;
    const imageUrl = `https://picsum.photos/seed/${seedId}/800/600`;
    const createdAt = randomDate(60, 0);

    qaPosts.push({
      user_id: farmer.id,
      title: title,
      caption: caption,
      image_path: imageUrl,
      status: 'Approved',
      created_at: createdAt,
      is_test: true,
      _crop: crop,
      _location: location,
      _symptom: symptom
    });
  }

  // Insert Q&A posts
  let { data: insertedPosts, error } = await supabaseAdmin
    .from('posts')
    .insert(qaPosts.map(({ _crop, _location, _symptom, ...rest }) => rest))
    .select('id, created_at');

  if (error && error.message?.includes('is_test')) {
    const fallback = qaPosts.map(({ is_test, _crop, _location, _symptom, ...rest }) => rest);
    const res = await supabaseAdmin.from('posts').insert(fallback).select('id, created_at');
    insertedPosts = res.data;
  }

  if (!insertedPosts || insertedPosts.length === 0) {
    return [];
  }

  // Insert Expert Answers as comments
  const answerComments = [];
  for (let idx = 0; idx < insertedPosts.length; idx++) {
    const post = insertedPosts[idx];
    const orig = qaPosts[idx];
    const expert = randomElement(experts);

    const ansTemplate = randomElement(EXPERT_ANSWER_TEMPLATES);
    const ansText = ansTemplate
      .replace('{crop}', orig._crop)
      .replace('{location}', orig._location)
      .replace('{symptom}', orig._symptom);

    const postTime = new Date(post.created_at || Date.now()).getTime();
    const commentTime = new Date(postTime + randomInt(2, 24) * 60 * 60 * 1000).toISOString();

    answerComments.push({
      post_id: post.id,
      user_id: expert.id,
      comment_text: `👨‍⚕️ Expert Response (${expert.fullName}): ${ansText}`,
      created_at: commentTime,
      is_test: true
    });
  }

  await supabaseAdmin.from('comments').insert(answerComments).catch(async () => {
    const fallback = answerComments.map(({ is_test, ...rest }) => rest);
    await supabaseAdmin.from('comments').insert(fallback).catch(() => {});
  });

  console.log(`✅ Generated ${insertedPosts.length} Expert Q&A posts with Expert answers.`);
  return insertedPosts;
}
