export type AuthRouteStep = "noas" | "noasSignUp";

const AUTH_ROUTE_BY_STEP: Record<AuthRouteStep, string> = {
  noas: "/signin",
  noasSignUp: "/signup",
};

export function buildAuthRoute(step: AuthRouteStep): string {
  return AUTH_ROUTE_BY_STEP[step];
}

export function resolveAuthRouteStep(pathname: string): AuthRouteStep | null {
  if (pathname === "/signin") return "noas";
  if (pathname === "/signup") return "noasSignUp";
  return null;
}
