export async function onRequestPost(context) {
  try {
    const { slug } = await context.request.json();

    if (!slug) {
      return new Response(JSON.stringify({ ok: false, error: "Missing slug" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cleanSlug = String(slug).trim().toLowerCase();

    const formula = `AND({slug}="${cleanSlug}", {is_visible}=TRUE())`;

    const url =
      `https://api.airtable.com/v0/${context.env.AIRTABLE_BASE_ID}/${encodeURIComponent(context.env.AIRTABLE_TABLE_NAME)}` +
      `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;

    const airtableRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${context.env.AIRTABLE_API_KEY}`
      }
    });

    const airtableData = await airtableRes.json();

    if (!airtableData.records || airtableData.records.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid slug" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      slug: cleanSlug,
      entry: "/public/js/winterword-engine-singleurl.js"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
