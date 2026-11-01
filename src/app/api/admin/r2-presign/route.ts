import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Resolves mandatory Cloudflare R2 Content-Type and Content-Encoding headers
 * for Unity WebGL Brotli (.br) and uncompressed build artifacts.
 */
function resolveWebGLFileHeaders(fileName: string): {
  contentType: string;
  contentEncoding?: string;
} {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".wasm.br")) {
    return { contentType: "application/wasm", contentEncoding: "br" };
  }
  if (lower.endsWith(".js.br")) {
    return { contentType: "application/javascript", contentEncoding: "br" };
  }
  if (lower.endsWith(".data.br")) {
    return { contentType: "application/octet-stream", contentEncoding: "br" };
  }
  if (lower.endsWith(".wasm.gz")) {
    return { contentType: "application/wasm", contentEncoding: "gzip" };
  }
  if (lower.endsWith(".js.gz")) {
    return { contentType: "application/javascript", contentEncoding: "gzip" };
  }
  if (lower.endsWith(".data.gz")) {
    return { contentType: "application/octet-stream", contentEncoding: "gzip" };
  }
  if (lower.endsWith(".wasm")) {
    return { contentType: "application/wasm" };
  }
  if (lower.endsWith(".js")) {
    return { contentType: "application/javascript" };
  }
  return { contentType: "application/octet-stream" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, fileName } = body as { slug?: string; fileName?: string };

    if (!slug || !fileName) {
      return NextResponse.json(
        { error: "Missing slug or fileName" },
        { status: 400 }
      );
    }

    const headers = resolveWebGLFileHeaders(fileName);
    const objectKey = `builds/${slug}/${fileName}`;

    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME || "tailoredplay-builds";
    const publicBaseUrl = (
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL || `/builds`
    ).replace(/\/$/, "");

    // If Cloudflare R2 credentials are not configured yet, instruct the client
    // to use the local /public/builds fallback uploader for local testing.
    if (!accountId || !accessKeyId || !secretAccessKey) {
      return NextResponse.json({
        mode: "local_fallback",
        objectKey,
        headers,
        r2BaseUrl: `/builds/${slug}`,
      });
    }

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: headers.contentType,
      ...(headers.contentEncoding
        ? { ContentEncoding: headers.contentEncoding }
        : {}),
      CacheControl: "public, max-age=31536000, immutable",
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return NextResponse.json({
      mode: "r2_presigned",
      uploadUrl,
      objectKey,
      headers,
      r2BaseUrl: `${publicBaseUrl}/builds/${slug}`,
    });
  } catch (err) {
    console.error("[/api/admin/r2-presign] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
