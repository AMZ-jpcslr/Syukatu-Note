import {
  cors,
  extensionIdentity,
  enqueueImport,
  jsonBody,
  importError,
} from "@/services/import-server";
export const runtime = "nodejs";
export async function OPTIONS(request: Request) {
  try {
    return new Response(null, { status: 204, headers: cors(request, true) });
  } catch {
    return new Response(null, { status: 403 });
  }
}
export async function POST(request: Request) {
  let headers: Record<string, string> = {};
  try {
    const identity = await extensionIdentity(request);
    headers = identity.headers;
    const id = await enqueueImport(
      identity.user,
      "mypage",
      await jsonBody(request),
    );
    return Response.json({ id, success: true }, { headers });
  } catch (error) {
    return importError(error, headers);
  }
}
