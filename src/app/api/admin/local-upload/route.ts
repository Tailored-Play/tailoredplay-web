import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

/**
 * Local development uploader that saves client-extracted TailoredCore HTML5 bundle files
 * to `public/builds/[slug]/[fileName]` when Cloudflare R2 env vars are not yet set.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const slug = (formData.get("slug") as string | null)?.replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    );
    const rawFileName = (formData.get("fileName") as string | null) ?? "";
    const fileName = rawFileName
      .replace(/\\/g, "/")
      .split("/")
      .filter((seg) => seg.length > 0 && seg !== "." && seg !== "..")
      .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, ""))
      .join("/");
    const file = formData.get("file") as File | null;

    if (!slug || !fileName || !file) {
      return NextResponse.json(
        { error: "Missing slug, fileName, or file blob" },
        { status: 400 }
      );
    }

    const targetDir = path.join(process.cwd(), "public", "builds", slug);
    const filePath = path.join(targetDir, fileName);
    await mkdir(path.dirname(filePath), { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(arrayBuffer));

    return NextResponse.json({
      ok: true,
      savedTo: `/builds/${slug}/${fileName}`,
      r2BaseUrl: `/builds/${slug}`,
    });
  } catch (err) {
    console.error("[/api/admin/local-upload] Error:", err);
    return NextResponse.json(
      { error: "Failed saving local TailoredCore HTML5 build file" },
      { status: 500 }
    );
  }
}
