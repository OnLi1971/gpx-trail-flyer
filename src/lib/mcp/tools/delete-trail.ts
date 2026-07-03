declare const process: { env: Record<string, string | undefined> };
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "delete_trail",
  title: "Delete trail",
  description: "Delete a trail owned by the signed-in user, identified by slug.",
  inputSchema: {
    slug: z.string().trim().min(1).describe("Slug of the trail to delete."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ slug }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("trails")
      .delete()
      .eq("slug", slug)
      .eq("user_id", ctx.getUserId())
      .select("id,slug,name");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      return { content: [{ type: "text", text: "No matching trail found for this user." }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Deleted trail "${data[0].name}" (${data[0].slug}).` }],
      structuredContent: { deleted: data[0] },
    };
  },
});
