import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL  || 'https://gzcsvexfnfzwtmlayafb.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6Y3N2ZXhmbmZ6d3RtbGF5YWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDI0NDQsImV4cCI6MjA5MzUxODQ0NH0.5-kUMR7PB10kOUzyKM8RvQae1S7NFG81LsKd1Lv7M_k';

export const supabase = createClient(supabaseUrl, supabaseKey);
