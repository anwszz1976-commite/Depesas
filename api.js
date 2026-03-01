const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS months (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      month_key TEXT REFERENCES months(key) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      cat TEXT NOT NULL,
      val NUMERIC(10,2) NOT NULL,
      grupo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      venc TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers };

  try {
    await initDB();
    const path = event.path.replace("/.netlify/functions/api", "").replace("/api", "");
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    // GET /months - list all months with items
    if (method === "GET" && path === "/months") {
      const months = await sql`SELECT * FROM months ORDER BY key ASC`;
      const items  = await sql`SELECT * FROM items ORDER BY created_at ASC`;
      const result = months.map(m => ({
        key: m.key,
        label: m.label,
        items: items.filter(i => i.month_key === m.key).map(i => ({
          id: i.id,
          nome: i.nome,
          cat: i.cat,
          val: parseFloat(i.val),
          grupo: i.grupo,
          status: i.status,
          venc: i.venc || ""
        }))
      }));
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // POST /months - create month
    if (method === "POST" && path === "/months") {
      const { key, label } = body;
      await sql`INSERT INTO months (key, label) VALUES (${key}, ${label}) ON CONFLICT (key) DO NOTHING`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // POST /items - add item
    if (method === "POST" && path === "/items") {
      const { month_key, nome, cat, val, grupo, status, venc } = body;
      const result = await sql`
        INSERT INTO items (month_key, nome, cat, val, grupo, status, venc)
        VALUES (${month_key}, ${nome}, ${cat}, ${val}, ${grupo}, ${status}, ${venc || ""})
        RETURNING id
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ id: result[0].id }) };
    }

    // PUT /items/:id - update status
    if (method === "PUT" && path.startsWith("/items/")) {
      const id = path.split("/")[2];
      const { status } = body;
      await sql`UPDATE items SET status = ${status} WHERE id = ${id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // DELETE /items/:id
    if (method === "DELETE" && path.startsWith("/items/")) {
      const id = path.split("/")[2];
      await sql`DELETE FROM items WHERE id = ${id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
