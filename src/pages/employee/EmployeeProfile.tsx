import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import type { EmployeeProfile } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function EmployeeProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [draft, setDraft] = useState<EmployeeProfile | null>(profile);

  useEffect(() => setDraft(profile), [profile]);

  if (!draft) return null;

  const save = async () => {
    await api.upsertProfile(draft);
    await api.log({ actor: draft.email, action: "profile.update" });
    await refreshProfile();
    toast.success("Profile saved");
  };

  const set = <K extends keyof EmployeeProfile>(k: K, v: EmployeeProfile[K]) =>
    setDraft({ ...draft, [k]: v });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">My profile</h1>
      <Card className="p-6 grid sm:grid-cols-2 gap-4">
        <Field label="Employee ID">
          <Input value={draft.employeeId} onChange={(e) => set("employeeId", e.target.value)} />
        </Field>
        <Field label="Full name">
          <Input value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={draft.email} disabled />
        </Field>
        <Field label="Mobile number">
          <Input value={draft.mobile} onChange={(e) => set("mobile", e.target.value)} />
        </Field>
        <Field label="Department">
          <Input value={draft.department} onChange={(e) => set("department", e.target.value)} />
        </Field>
        <Field label="Employee type">
          <Select value={draft.employeeType} onValueChange={(v) => set("employeeType", v as EmployeeProfile["employeeType"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="permanent">Permanent</SelectItem>
              <SelectItem value="contractual">Contractual / Temporary</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2 pt-2">
          <Button onClick={save}>Save changes</Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
