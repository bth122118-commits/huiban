// =====================================================================
// 汇办 Huiban · 浏览器端 Supabase client（单例，走 RLS）
// client 组件里：import { supabase } from "@/lib/supabase-browser"
// 环境变量：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// =====================================================================

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
