/**
 * Supabase 配置
 * 使用旧版 2.49.4（有完整 UMD 包装器，浏览器兼容性好）
 */

const SUPABASE_URL  = 'https://avxhoefkilkvsimiitaf.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2eGhvZWZraWxrdnNpbWlpdGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjUyODcsImV4cCI6MjA5NzE0MTI4N30.PWlRkfR1uWOmE11bQi5jPIS3jvk8G115rtdGruMCmn0';

// 从 SDK 全局对象中解构出 createClient
var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
