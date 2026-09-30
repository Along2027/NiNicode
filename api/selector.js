const crypto = require("node:crypto");
const { neon } = require("@neondatabase/serverless");

const COOKIE_NAME = "healing_session";
const MAX_STATE_BYTES = 4 * 1024 * 1024;

function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map(part => part.trim()).filter(Boolean).map(part => {
      const index = part.indexOf("=");
      return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    })
  );
}

function getSession(req, res) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");

  const raw = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (raw) {
    const separator = raw.lastIndexOf(".");
    const id = raw.slice(0, separator);
    const signature = raw.slice(separator + 1);
    const expected = sign(id, secret);
    if (id && signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return id;
    }
  }

  const id = crypto.randomUUID();
  const token = `${id}.${sign(id, secret)}`;
  const secure = req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? "; Secure" : ""}`);
  return id;
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS healing_map_states (
      session_id UUID PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0,
      state JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

module.exports = async function handler(req, res) {
  if (!process.env.DATABASE_URL) return json(res, 503, { error: "云数据库尚未配置" });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const sessionId = getSession(req, res);
    await ensureSchema(sql);

    if (req.method === "GET") {
      const rows = await sql`SELECT revision, state FROM healing_map_states WHERE session_id = ${sessionId}::uuid`;
      return json(res, 200, rows[0] || { revision: 0, state: null });
    }

    if (req.method === "POST") {
      const { state, revision } = req.body || {};
      if (!state || typeof state !== "object" || !Number.isInteger(revision) || revision < 0) {
        return json(res, 400, { error: "保存数据格式无效" });
      }
      if (Buffer.byteLength(JSON.stringify(state), "utf8") > MAX_STATE_BYTES) {
        return json(res, 413, { error: "记录过大，请减少上传图片数量或尺寸后重试" });
      }

      const rows = await sql`
        INSERT INTO healing_map_states (session_id, revision, state)
        VALUES (${sessionId}::uuid, 1, ${JSON.stringify(state)}::jsonb)
        ON CONFLICT (session_id) DO UPDATE
        SET revision = healing_map_states.revision + 1,
            state = EXCLUDED.state,
            updated_at = NOW()
        WHERE healing_map_states.revision = ${revision}
        RETURNING revision
      `;
      if (!rows[0]) return json(res, 409, { error: "云端记录已更新，请刷新页面后重试" });
      return json(res, 200, { revision: rows[0].revision });
    }

    if (req.method === "DELETE") {
      const revision = req.body?.revision;
      if (!Number.isInteger(revision) || revision < 0) return json(res, 400, { error: "版本号无效" });
      const rows = await sql`
        DELETE FROM healing_map_states
        WHERE session_id = ${sessionId}::uuid AND revision = ${revision}
        RETURNING session_id
      `;
      if (!rows[0] && revision !== 0) return json(res, 409, { error: "云端记录已更新，请刷新页面后重试" });
      return json(res, 200, { revision: 0, state: null });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return json(res, 405, { error: "不支持的请求方法" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "云端保存暂时不可用" });
  }
};
