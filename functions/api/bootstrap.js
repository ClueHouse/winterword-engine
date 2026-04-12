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

    const allowedSlugs = ["boprc", "testslug"];

    if (!allowedSlugs.includes(cleanSlug)) {
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
