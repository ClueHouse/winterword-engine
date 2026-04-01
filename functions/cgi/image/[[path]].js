export async function onRequest(context) {
  const { params } = context;
  const path = params.path;

  const url = `https://winterword.cluehouse.co.nz/cgi/image/${path}`;

  const response = await fetch(url);

  return new Response(response.body, {
    status: response.status,
    headers: response.headers
  });
}
