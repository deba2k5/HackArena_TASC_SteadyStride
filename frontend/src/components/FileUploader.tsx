import { useCallback, useState } from "react";
import { UploadCloud, X, FileText, Image as ImageIcon, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadFile } from "@/lib/upload";
import { toast } from "sonner";

export interface UploadedFile {
  name: string;
  url: string;
  type: string;
}

export default function FileUploader({
  value,
  onChange,
}: {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
}) {
  const [dragOver, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = ".pdf,.doc,.docx,.txt,image/*";

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      try {
        const uploaded: UploadedFile[] = [];
        for (const f of Array.from(files)) {
          const u = await uploadFile(f);
          uploaded.push(u);
        }
        onChange([...value, ...uploaded]);
        toast.success(`Uploaded ${uploaded.length} file(s)`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [value, onChange]
  );

  const icon = (t: string) =>
    t.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> :
    t.includes("pdf") ? <FileText className="h-4 w-4" /> :
    <FileIcon className="h-4 w-4" />;

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"
        }`}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
        <div className="text-sm font-medium">
          {busy ? "Uploading…" : "Drop files or click to upload"}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          PDF, Word, text, images
        </div>
        <input
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </label>

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-card">
              {icon(f.type)}
              <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                {f.name}
              </a>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
