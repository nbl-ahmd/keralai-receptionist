import { useState } from "react";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { KnowledgeItem } from "@/types";

import { EmptyState, toDate } from "./shared";

interface InstructionsSectionProps {
  instructions: KnowledgeItem[];
  loading: boolean;
  onToggle: (item: KnowledgeItem) => void;
  onDelete: (id: string) => void;
  onAdd: (title: string, content: string) => Promise<boolean>;
}

export function InstructionsSection({
  instructions,
  loading,
  onToggle,
  onDelete,
  onAdd,
}: InstructionsSectionProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeCount = instructions.filter((item) => item.isActive !== false).length;

  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      const ok = await onAdd(title.trim(), content.trim());
      if (ok) {
        setTitle("");
        setContent("");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-emerald-200/70">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600" /> Active instructions
            </CardTitle>
            <CardDescription>
              Temporary instructions that affect the assistant on new calls. They are applied directly — not
              searched like reference knowledge.
            </CardDescription>
          </div>
          <Badge variant={activeCount > 0 ? "default" : "secondary"}>
            {activeCount} active
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
            <p className="text-sm font-medium text-slate-900">Add an instruction</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Write it the way you&apos;d explain it to a person. It applies to calls right away.
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="instruction-title" className="text-xs font-medium text-slate-600">
                  Title
                </label>
                <Input
                  id="instruction-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. In a meeting"
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="instruction-content" className="text-xs font-medium text-slate-600">
                  What should the assistant say or do?
                </label>
                <Textarea
                  id="instruction-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  placeholder="Tell callers Nabeel is in a meeting until 5 PM and will call back after."
                  className="mt-1 resize-none"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                  New instructions are activated for upcoming calls.
                </p>
                <Button
                  onClick={submit}
                  disabled={isSaving || !title.trim() || !content.trim()}
                  className="gap-1.5"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add instruction
                </Button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="skeleton h-24 rounded-xl" />
              ))}
            </div>
          ) : instructions.length === 0 ? (
            <EmptyState
              icon={<Zap className="h-5 w-5" />}
              title="No temporary instructions are active"
              description="Add an instruction when you want the assistant to behave differently for upcoming calls."
            />
          ) : (
            <div className="space-y-3">
              {instructions.map((item) => {
                const active = item.isActive !== false;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-xl border p-4 transition-colors",
                      active ? "border-emerald-200/80 bg-emerald-50/40" : "border-slate-200/80 bg-white",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-300")}
                            aria-hidden
                          />
                          <Badge variant={active ? "default" : "secondary"}>
                            {active ? "Active" : "Inactive"}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            Updated {toDate(item.dateAdded).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.content}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={active ? "outline" : "subtle"}
                          size="sm"
                          onClick={() => onToggle(item)}
                        >
                          {active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete instruction ${item.title}`}
                          className="text-slate-500 hover:text-red-600"
                          onClick={() => onDelete(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default InstructionsSection;
