import { DRIVE_UPLOAD_URL } from "./config";

/**
 * Uploads a file to the configured Google Drive endpoint (typically an
 * Apps Script Web App — see BACKEND.md). Falls back to an in-browser
 * blob URL so previews still work in dev without a backend.
 */
export async function uploadFile(file: File): Promise<{ url: string; name: string; type: string }> {
  if (!DRIVE_UPLOAD_URL) {
    return { url: URL.createObjectURL(file), name: file.name, type: file.type };
  }
  const form = new FormData();
  form.append("file", file);
  form.append("filename", file.name);
  const res = await fetch(DRIVE_UPLOAD_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  return { url: data.url || data.fileUrl, name: file.name, type: file.type };
}
