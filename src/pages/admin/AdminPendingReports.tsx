import { useEffect, useState } from "react";
import { api, fmtDuration } from "@/lib/api";
import type { WorkSession } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Check, X, FileText } from "lucide-react";

export default function AdminPendingReports() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});

  const reload = async () => {
    const all = await api.listSessions();
    setSessions(all.filter((s) => s.clockOut && s.status === "pending"));
  };
  useEffect(() => { reload(); }, []);

  const review = async (s: WorkSession, decision: "approved" | "rejected") => {
    await api.reviewSession(s.id, decision, comments[s.id] || "", user!.email!);
    toast.success(`Report ${decision}`);
    reload();
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1>Pending reports</h1>
        <p>Review and approve submitted work sessions.</p>
      </div>
      {sessions.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground shadow-card">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-success/10 mb-3">
            <Check className="h-5 w-5 text-success" />
          </div>
          <p className="font-medium">All caught up</p>
          <p className="text-sm">No pending reports to review.</p>
        </Card>
      )}
      <div className="space-y-4">
        {sessions.map((s) => (
          <Card key={s.id} className="p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium">{s.fullName} <span className="text-muted-foreground text-sm">({s.email})</span></div>
                <div className="text-xs text-muted-foreground">{s.date} · in {new Date(s.clockIn).toLocaleTimeString()} · out {s.clockOut && new Date(s.clockOut).toLocaleTimeString()}</div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline">{s.workType?.split("_").join(" ") || "—"}</Badge>
                <span>Work {fmtDuration((s.totalWorkMs || 0) - (s.totalBreakMs || 0))}</span>
                <span className="text-muted-foreground">Break {fmtDuration(s.totalBreakMs)}</span>
              </div>
            </div>
            {s.description && (
              <p className="text-sm bg-secondary/40 rounded-md p-3 whitespace-pre-wrap">{s.description}</p>
            )}
            {s.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {s.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs border rounded-md px-3 py-1.5 hover:bg-secondary">
                    <FileText className="h-3.5 w-3.5" /> {a.name}
                  </a>
                ))}
              </div>
            )}
            <Textarea
              placeholder="Add a comment (optional)"
              value={comments[s.id] || ""}
              onChange={(e) => setComments({ ...comments, [s.id]: e.target.value })}
            />
            <div className="flex gap-2">
              <Button className="gap-2" onClick={() => review(s, "approved")}><Check className="h-4 w-4" />Approve</Button>
              <Button variant="destructive" className="gap-2" onClick={() => review(s, "rejected")}><X className="h-4 w-4" />Reject</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
