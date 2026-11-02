"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FetchError } from "@/lib/client";
import { label as human } from "@/lib/domain";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select";
  options?: { value: string | number; label: string }[];
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMsg?: string;
  hint?: string;
};

export const enumOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: human(v) }));

/**
 * Generic create/edit dialog. Validates required/length/pattern on the client,
 * then shows the server's per-field errors (zod) or banner error if it rejects.
 */
export function FormDialog({ open, onOpenChange, title, description, fields, initial, submitLabel = "Save", onSubmit, successMessage, extra }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  fields: Field[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
  onSubmit: (values: Record<string, string | number | null>) => Promise<unknown>;
  successMessage: string;
  extra?: ReactNode;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(fields.map((f) => [f.name, initial?.[f.name] == null ? "" : String(initial[f.name])])));
    setErrors({});
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validate = () => {
    const e: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.name] ?? "").trim();
      if (f.required && !v) e[f.name] = `${f.label} is required.`;
      else if (v && f.minLength && v.length < f.minLength) e[f.name] = `At least ${f.minLength} characters.`;
      else if (v && f.maxLength && v.length > f.maxLength) e[f.name] = `At most ${f.maxLength} characters.`;
      else if (v && f.pattern && !f.pattern.test(v)) e[f.name] = f.patternMsg ?? "Invalid format.";
      else if (v && f.type === "select" && !f.options?.some((o) => String(o.value) === v)) e[f.name] = "Choose one of the options.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setFormError(null);
    try {
      const out: Record<string, string | number | null> = {};
      for (const f of fields) {
        const v = (values[f.name] ?? "").trim();
        out[f.name] = v === "" ? null : f.type === "select" && typeof f.options?.[0]?.value === "number" ? Number(v) : v;
      }
      await onSubmit(out);
      toast.success(successMessage);
      onOpenChange(false);
    } catch (e) {
      const fe = e as FetchError;
      if (fe.data?.fields) setErrors(fe.data.fields as Record<string, string>);
      setFormError(fe.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="my-4 space-y-3">
            {formError && <div role="alert" className="rounded-lg border border-risk-high/40 bg-risk-high-bg px-3 py-2 text-sm text-risk-high">{formError}</div>}
            {extra}
            {fields.map((f) => {
              const id = `f-${f.name}`;
              const err = errors[f.name];
              const common = {
                id, value: values[f.name] ?? "", "aria-invalid": !!err, "aria-describedby": err ? `${id}-err` : f.hint ? `${id}-hint` : undefined,
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [f.name]: e.target.value })),
              };
              return (
                <div key={f.name} className="space-y-1.5">
                  <Label htmlFor={id}>{f.label}{f.required && <span className="text-risk-high" aria-hidden> *</span>}</Label>
                  {f.type === "textarea" ? <Textarea rows={3} maxLength={f.maxLength} {...common} />
                    : f.type === "select" ? (
                      <select {...common} className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        <option value="">Select…</option>
                        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : <Input maxLength={f.maxLength} {...common} />}
                  {f.hint && !err && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{f.hint}</p>}
                  {err && <p id={`${id}-err`} className="text-xs text-risk-high">{err}</p>}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
