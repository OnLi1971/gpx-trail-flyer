import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMyTrailsTool from "./tools/list-my-trails";
import getTrailTool from "./tools/get-trail";
import deleteTrailTool from "./tools/delete-trail";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "gpx-trail-flyer-mcp",
  title: "GPX Trail Flyer",
  version: "0.1.0",
  instructions:
    "Tools for managing the signed-in user's saved GPX trails in GPX Trail Flyer. Use list_my_trails to browse trails, get_trail to inspect one by slug, and delete_trail to remove one.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMyTrailsTool, getTrailTool, deleteTrailTool],
});
