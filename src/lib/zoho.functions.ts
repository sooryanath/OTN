import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const gstinInput = z.object({ gstin: z.string().length(15) });

export const listZohoConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listZohoConnections: list } = await import("@/lib/zoho.server");
    return list(context.userId);
  });

export const beginZohoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ gstin: z.string().length(15), returnTo: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { beginZohoConnection: begin } = await import("@/lib/zoho.server");
    return begin(context.userId, data.gstin, data.returnTo ?? "/app");
  });

export const disconnectZoho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => gstinInput.parse(input))
  .handler(async ({ data, context }) => {
    const { disconnectZoho: disconnect } = await import("@/lib/zoho.server");
    return disconnect(context.userId, data.gstin);
  });

export const syncZohoDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { syncZohoDocument: sync } = await import("@/lib/zoho.server");
    return sync(context.userId, data.documentId);
  });