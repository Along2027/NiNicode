function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "不支持的请求方法" });
  }

  const q = String(req.query.q || "").trim();
  if (q.length < 2 || q.length > 100) return json(res, 400, { error: "请输入 2–100 个字符的地点" });

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("accept-language", "zh-CN,zh,en");
    const response = await fetch(url, {
      headers: {
        "User-Agent": "home-healing-map/1.0 (Vercel deployment)",
        "Accept": "application/json"
      }
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const data = await response.json();
    const results = data.map(item => ({
      name: item.display_name,
      latitude: Number(item.lat),
      longitude: Number(item.lon)
    })).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    return json(res, 200, { results });
  } catch (error) {
    console.error(error);
    return json(res, 502, { error: "地点搜索暂时不可用" });
  }
};
