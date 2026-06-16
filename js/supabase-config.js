/**
 * Supabase 配置
 */

const SUPABASE_URL  = 'https://avxhoefkilkvsimiitaf.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2eGhvZWZraWxrdnNpbWlpdGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjUyODcsImV4cCI6MjA5NzE0MTI4N30.PWlRkfR1uWOmE11bQi5jPIS3jvk8G115rtdGruMCmn0';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
