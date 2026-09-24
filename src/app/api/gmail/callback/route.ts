import { cookies } from "next/headers";
import { appOrigin } from "@/services/import-server";
import { finishGmail } from "@/services/gmail";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies();
  let status = "error";
  try {
    if (url.searchParams.get("error")) throw new Error("cancelled");
    await finishGmail(
      url.searchParams.get("state") ?? "",
      url.searchParams.get("code") ?? "",
      store.get("career-gmail-state")?.value ?? "",
    );
    status = "connected";
  } catch {
    /* No provider error or tokens are reflected in the URL. */
  }
  store.set("career-gmail-state", "", {
    path: "/api/gmail",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: appOrigin().startsWith("https:"),
  });
  return Response.redirect(
    appOrigin() + "/settings?gmail=" + status + "#connections",
    303,
  );
}
