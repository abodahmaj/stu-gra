import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kjhmeqisvvpsvcurarpl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaG1lcWlzdnZwc3ZjdXJhcnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NTk5MjQsImV4cCI6MjA4MjIzNTkyNH0.fIuOrhS9HEkYA9jJbMV7M7MXfMkItQZudkTt_FaWkR0';

export const supabase = createClient(supabaseUrl, supabaseKey);
