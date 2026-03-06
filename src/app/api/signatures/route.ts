import { getSupabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, count, error } = await supabase
      .from("signatures")
      .select("id, prenom, nom, programme, message, likes_count, created_at", { count: "exact" })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ signatures: [], count: 0 });
    }

    return NextResponse.json({
      signatures: data ?? [],
      count: count ?? 0,
    });
  } catch {
    return NextResponse.json({ signatures: [], count: 0 });
  }
}
