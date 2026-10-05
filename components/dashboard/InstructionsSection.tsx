import { useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { KnowledgeItem } from "@/types";

import { toDate } from "./shared";

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
      <Card className="border-emerald-200/60">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-display">
              <Zap className="h-4 w-4 text-primary" aria-hidden /> Active instructions
            </CardTitle>
            <CardDescription className="mt-1">
              Temporary instructions that affect the assistant on new calls. They are applied directly — not searched
              like reference knowledge.
            </CardDescription>
          </div>
          <Badge variant={activeCount > 0 ? "success" : "secondary"}>{activeCount} active</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-sm font-medium text-foreground">Add an instruction</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Write it the way you&apos;d explain it to a person. It applies to calls right away.
            </p>
            <div className="mt-4 space-y-4">
              <Field label="Title">
                {({ id, ...aria }) => (
                  <Input
                    id={id}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. In a meeting"
                    {...aria}
                  />
                )}
              </Field>
              <Field label="What should the assistant say or do?">
                {({ id, ...aria }) => (
                  <Textarea
                    id={id}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={3}
                    placeholder="e.g. We are closed today. Tell callers we will be back tomorrow."
                    className="resize-none"
                    {...aria}
                  />
                )}
              </Field>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">New instructions are activated for upcoming calls.</p>
                <Button
                  onClick={submit}
                  disabled={isSaving || !title.trim() || !content.trim()}
                  loading={isSaving}
                  className="w-full gap-1.5 sm:w-auto"
                >
                  {!isSaving && <Plus className="h-4 w-4" aria-hidden />}
                  Add instruction
                </Button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
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
                      active ? "border-emerald-200/70 bg-success-soft/40" : "border-border bg-card",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={active ? "success" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>
                          <span className="text-xs text-muted-foreground">
                            Updated {toDate(item.dateAdded).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.content}</p>
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
                          className="text-muted-foreground hover:text-red-600"
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
