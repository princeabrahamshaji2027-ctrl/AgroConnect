import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mgreapakfchcxcrauheq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncmVhcGFrZmNoY3hjcmF1aGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTMyNDYsImV4cCI6MjEwMDk2OTI0Nn0.Gv5LwnoTtRdylsbXExKEC-epiGKvunQrAKdfysf2C1k';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
