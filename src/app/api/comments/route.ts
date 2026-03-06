import { getSupabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("comments")
      .select("id, prenom, programme, content, likes_count, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ comments: [] });
    }

    return NextResponse.json({ comments: data ?? [] });
  } catch {
    return NextResponse.json({ comments: [] });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { prenom, programme, content } = body;

  if (!prenom || !programme || !content) {
    return NextResponse.json(
      { error: "Tous les champs sont requis." },
      { status: 400 }
    );
  }

  if (content.length > 500) {
    return NextResponse.json(
      { error: "Le commentaire ne peut pas dépasser 500 caractères." },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { error } = await supabase.from("comments").insert({
    prenom: prenom.trim(),
    programme,
    content: content.trim(),
  });

  if (error) {
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
