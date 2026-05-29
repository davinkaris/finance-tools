import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

async function isOnboardingCompleted(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (error) return false;
  return data?.onboarding_completed === true;
}

export async function middleware(request) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) => {
          response.cookies.set({ name, value, ...options });
        },
        remove: (name, options) => {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const protectedRoutes = ["/dashboard", "/accounts", "/upload"];
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );
  const isOnboarding = pathname.startsWith("/onboarding");

  if ((isProtected || isOnboarding) && !session) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  if (session) {
    const onboardingDone = await isOnboardingCompleted(
      supabase,
      session.user.id,
    );

    if (isProtected && !onboardingDone) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    if (isOnboarding && onboardingDone) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (pathname === "/auth") {
      return NextResponse.redirect(
        new URL(onboardingDone ? "/dashboard" : "/onboarding", request.url),
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/accounts/:path*",
    "/upload/:path*",
    "/onboarding",
    "/onboarding/:path*",
    "/auth",
  ],
};
