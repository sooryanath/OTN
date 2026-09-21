import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/zoho/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const providerError = url.searchParams.get("error");
        if (providerError) return new Response(`Zoho authorization failed: ${providerError}`, { status: 400 });
        if (!code || !state) return new Response("Missing Zoho authorization parameters", { status: 400 });
        try {
          const { handleZohoCallback } = await import("@/lib/zoho.server");
          const returnTo = await handleZohoCallback(code, state);
          return Response.redirect(new URL(returnTo, url.origin), 303);
        } catch (cause) {
          console.error("Zoho callback failed", cause);
          return new Response("Zoho connection could not be completed. Return to the app and try again.", { status: 400 });
        }
      },
    },
  },
});