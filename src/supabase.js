import { createClient } from '@supabase/supabase-js';

// Lấy thông tin URL và Key từ file .env bạn vừa tạo
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// Tạo kết nối và xuất ra để dùng ở các file khác
export const supabase = createClient(supabaseUrl, supabaseKey);