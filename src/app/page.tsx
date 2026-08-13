import { redirect } from "next/navigation";
import { listWorkspaces } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const workspaces = await listWorkspaces();
  redirect(`/w/${workspaces[0]?.slug ?? "meridian"}`);
}
