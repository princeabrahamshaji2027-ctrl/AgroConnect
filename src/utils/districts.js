// Launch districts (Kerala). Canonical values stored in profiles.district and posts.district (migrations 20–21);
// the database CHECK constraints use exactly these spellings.
export const DISTRICTS = ['Kannur', 'Pathanamthitta', 'Idukki', 'Kottayam'];
export const isDistrict = (v) => DISTRICTS.includes(v);
