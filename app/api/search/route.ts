import { NextRequest, NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const estado = (searchParams.get("estado") || "").trim();
    const municipio = (searchParams.get("municipio") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    // Construcción dinámica de condiciones
    const whereConditions: string[] = [];
    const args: (string | number)[] = [];

    if (q) {
      whereConditions.push("(nombre LIKE ? OR actividad LIKE ?)");
      args.push(`%${q}%`, `%${q}%`);
    }

    if (estado) {
      whereConditions.push("estado LIKE ?");
      args.push(`%${estado}%`);
    }

    if (municipio) {
      whereConditions.push("municipio LIKE ?");
      args.push(`%${municipio}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}` 
      : "";

    // Consulta de registros paginados
    const sql = `
      SELECT id, nombre, actividad, calle, numero, colonia, municipio, estado, telefono, correo
      FROM negocios
      ${whereClause}
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `;
    args.push(limit, offset);

    const rs = await turso.execute({ sql, args });

    return NextResponse.json({
      success: true,
      data: rs.rows,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("Error en /api/search:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al consultar la base de datos" },
      { status: 500 }
    );
  }
}
