import type { SupabaseClient } from '@supabase/supabase-js'

export interface Trip {
  id: string
  title: string
  destination: string
  start_date: string
  end_date: string
  summary: string
}

export async function getPrimaryTrip(supabase: SupabaseClient): Promise<Trip> {
  const { data, error } = await supabase
    .from('study_trips')
    .select('id, title, destination, start_date, end_date, summary')
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`读取研学项目失败: ${error.message}`)
  if (!data) throw new Error('研学项目尚未配置')
  return data as Trip
}
