// supabase/functions/get-available-slots/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
// CORSヘッダー
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // OPTIONSリクエスト（プリフライト）への対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { salonId, operatorId, duration } = await req.json();
    if (!salonId || !duration) {
      throw new Error("Salon ID and duration are required.");
    }
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // 予約可能なスロットを取得
    let query = supabaseClient.from('slots').select('slot_date, slot_time, operator_id').eq('salon_id', salonId).eq('is_booked', false).gte('slot_date', new Date().toISOString().split('T')[0]).order('slot_date').order('slot_time');
    // 担当者が 'any' (おまかせ) でない場合、絞り込む
    if (operatorId && operatorId !== 'any') {
      query = query.eq('operator_id', operatorId);
    }
    const { data: slots, error } = await query;
    if (error) throw error;
    // --- ここからが計算ロジック ---
    const slotsByDate = slots.reduce((acc, slot)=>{
      acc[slot.slot_date] = acc[slot.slot_date] || [];
      acc[slot.slot_date].push(slot.slot_time);
      return acc;
    }, {});
    const availableDates = new Set();
    const availableTimesByDate = {};
    const slotsNeeded = Math.ceil(duration / 30); // 30分単位のスロットがいくつ必要か
    for(const date in slotsByDate){
      const times = slotsByDate[date].sort();
      availableTimesByDate[date] = [];
      for(let i = 0; i <= times.length - slotsNeeded; i++){
        const startTime = new Date(`${date}T${times[i]}`);
        const expectedEndTime = new Date(startTime.getTime() + (slotsNeeded - 1) * 30 * 60000);
        const actualEndTime = new Date(`${date}T${times[i + slotsNeeded - 1]}`);
        if (expectedEndTime.getTime() === actualEndTime.getTime()) {
          // 連続した枠が見つかった
          availableDates.add(date);
          availableTimesByDate[date].push(times[i]);
        }
      }
      if (availableTimesByDate[date].length === 0) {
        delete availableTimesByDate[date];
      }
    }
    return new Response(JSON.stringify({
      availableDates: Array.from(availableDates),
      availableTimesByDate
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
