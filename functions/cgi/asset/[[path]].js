export async function onRequest(context) {
  const { params, request } = context;
  const path = params.path;
  const url = new URL(`https://winterword.cluehouse.co.nz/cgi/asset/${path}`);
  url.search = new URL(request.url).search;

  const response = await fetch(url.toString());

  return new Response(response.body, {
    status: response.status,
    headers: response.headers
  });
}
