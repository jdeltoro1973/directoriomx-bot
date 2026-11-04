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

    const whereConditions: string[] = [];
    const args: (string | number)[] = [];

    // Búsqueda por nombre de negocio o nombre de categoría
    if (q) {
      whereConditions.push("(dp.nombre LIKE ? OR dc.nombre LIKE ?)");
      args.push(`%${q}%`, `%${q}%`);
    }

    // Filtros geográficos
    if (estado) {
      whereConditions.push("(dp.estado LIKE ? OR dp.slug_estado LIKE ?)");
      args.push(`%${estado}%`, `%${estado.toLowerCase()}%`);
    }

    if (municipio) {
      whereConditions.push("(dp.municipio LIKE ? OR dp.slug_municipio LIKE ?)");
      args.push(`%${municipio}%`, `%${municipio.toLowerCase()}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}` 
      : "";

    const sql = `
      SELECT 
        dp.id,
        dp.nombre,
        dp.tipo_vial,
        dp.calle,
        dp.num_ext,
        dp.colonia,
        dp.cp,
        dp.municipio,
        dp.estado,
        dp.lat,
        dp.lon,
        dp.telefono,
        dp.email,
        dp.web,
        dc.nombre AS categoria
      FROM directorio_prod dp
      LEFT JOIN directorio_categorias dc ON dp.categoria_id = dc.id
      ${whereClause}
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
