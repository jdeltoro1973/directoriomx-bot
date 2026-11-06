import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.message || !body.message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = body.message.chat.id;
    const userText = body.message.text.trim();

    if (userText === "/start") {
      const welcome = 
        "🔍 *Bienvenido al Directorio Nacional*\n\n" +
        "Escribe el nombre de un negocio o giro y el municipio.\n" +
        "_Ejemplo:_\n`Ferreteria Guadalajara`\n`Farmacia Toluca`";
      await sendTelegramMessage(chatId, welcome);
      return NextResponse.json({ ok: true });
    }

    // Dividir la búsqueda en términos para filtrar por nombre o municipio
    const terms = userText.split(" ").filter((t: string) => t.length > 2);
    
    if (terms.length === 0) {
      await sendTelegramMessage(chatId, "Ingresa un término de búsqueda más específico.");
      return NextResponse.json({ ok: true });
    }

    const queryPattern = `%${terms[0]}%`;
    const secondaryPattern = terms[1] ? `%${terms[1]}%` : queryPattern;

    // Consulta con postgres.js sobre los 6.13M de registros del DENUE
    const result = await db`
      SELECT 
        nom_estab,
        nombre_act,
        tipo_vial,
        nom_vial,
        numero_ext,
        nomb_asent,
        municipio,
        entidad,
        telefono
      FROM carto.denuenacional052025
      WHERE (nom_estab ILIKE ${queryPattern} OR nombre_act ILIKE ${queryPattern})
        AND (municipio ILIKE ${secondaryPattern} OR entidad ILIKE ${secondaryPattern} OR nom_estab ILIKE ${secondaryPattern})
      LIMIT 5
    `;

    if (result.length === 0) {
      await sendTelegramMessage(chatId, `No se encontraron resultados para: *${userText}*`);
      return NextResponse.json({ ok: true });
    }

    let response = `📍 *Resultados para:* _${userText}_\n\n`;

    for (const row of result) {
      const tel = row.telefono ? `\n📞 \`${row.telefono}\`` : "";
      const col = row.nomb_asent ? `, Col. ${row.nomb_asent}` : "";
      const vial = row.tipo_vial ? `${row.tipo_vial} ` : "";
      const calle = row.nom_vial ? `${vial}${row.nom_vial} ${row.numero_ext || "S/N"}${col}` : "Dirección disponible";
      
      response += `🏢 *${row.nom_estab}*\n`;
      response += `🏷 _${row.nombre_act || "Giro general"}_\n`;
      response += `📌 ${calle}, ${row.municipio}, ${row.entidad}${tel}\n\n`;
    }

    await sendTelegramMessage(chatId, response);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en Webhook:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}