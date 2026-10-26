// Launch districts (Kerala). Canonical values stored in profiles.district and posts.district (migration 20);
// the database CHECK constraints use exactly these spellings.
export const DISTRICTS = ['Kottayam', 'Pathanamthitta', 'Kannur'];
export const isDistrict = (v) => DISTRICTS.includes(v);
