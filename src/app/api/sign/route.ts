import { getSupabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { prenom, nom, email, programme } = body;

  if (!prenom || !nom || !email || !programme) {
    return NextResponse.json(
      { error: "Tous les champs sont requis." },
      { status: 400 }
    );
  }

  const emailLower = email.toLowerCase().trim();
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("signatures")
    .select("id")
    .eq("email", emailLower)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Cet email est déjà inscrit." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("signatures").insert({
    prenom: prenom.trim(),
    nom: nom.trim(),
    email: emailLower,
    programme,
    message: (body.message || "").trim().slice(0, 500),
  });

  if (error) {
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
