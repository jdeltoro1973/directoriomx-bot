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

    // Consulta optimizada a Turso
    const result = await db.execute({
      sql: `
        SELECT p.nombre, p.calle, p.num_ext, p.colonia, p.municipio, p.estado, p.telefono, c.nombre as categoria
        FROM directorio_prod p
        LEFT JOIN directorio_categorias c ON p.categoria_id = c.id
        WHERE (p.nombre LIKE ? OR c.nombre LIKE ?)
          AND (p.municipio LIKE ? OR p.estado LIKE ? OR p.nombre LIKE ?)
        LIMIT 5
      `,
      args: [queryPattern, queryPattern, secondaryPattern, secondaryPattern, secondaryPattern],
    });

    if (result.rows.length === 0) {
      await sendTelegramMessage(chatId, `No se encontraron resultados para: *${userText}*`);
      return NextResponse.json({ ok: true });
    }

    let response = `📍 *Resultados para:* _${userText}_\n\n`;

    for (const row of result.rows) {
      const tel = row.telefono ? `\n📞 \`${row.telefono}\`` : "";
      const col = row.colonia ? `, Col. ${row.colonia}` : "";
      const calle = row.calle ? `${row.calle} ${row.num_ext || "S/N"}${col}` : "Dirección disponible";
      
      response += `🏢 *${row.nombre}*\n`;
      response += `🏷 _${row.categoria || "Giro general"}_\n`;
      response += `📌 ${calle}, ${row.municipio}, ${row.estado}${tel}\n\n`;
    }

    await sendTelegramMessage(chatId, response);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en Webhook:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
