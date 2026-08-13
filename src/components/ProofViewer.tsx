import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";

export function ProofViewer({
  path,
  label = "عرض الإثبات",
  size = "sm",
}: {
  path: string | null | undefined;
  label?: string;
  size?: "sm" | "default";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!path) return <span className="text-xs text-muted-foreground">لا يوجد إثبات</span>;

  async function show() {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage.from("proofs").createSignedUrl(path!, 300);
      if (error || !data) throw new Error("تعذر فتح صورة الإثبات");
      setUrl(data.signedUrl);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={show} disabled={busy}>
        <ImageIcon className="size-4" />
        {busy ? "جارٍ الفتح..." : label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>صورة إثبات التحويل</DialogTitle>
          </DialogHeader>
          {url ? (
            <img src={url} alt="إثبات العملية" className="max-h-[70vh] w-full rounded-lg object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export async function uploadProof(file: File, userId: string, folder: string) {
  if (!file.type.startsWith("image/")) throw new Error("يجب اختيار ملف صورة صالح");
  if (file.size > 8 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 8 ميجابايت");
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("proofs").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error("فشل رفع الصورة، حاول مرة أخرى");
  return path;
}
