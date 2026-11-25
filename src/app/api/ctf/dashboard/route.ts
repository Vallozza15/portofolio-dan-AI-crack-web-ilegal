import { guard, errorResponse, noStoreJson } from "@/lib/ctf/api";
import { getDashboardData } from "@/lib/ctf/dashboard";

export async function GET(request: Request) {
  const blocked = await guard(request, "dashboard", 60);
  if (blocked) return blocked;
  try {
    return noStoreJson({ dashboard: await getDashboardData() });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
