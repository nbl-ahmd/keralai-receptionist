import type { RefObject } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  MessageSquarePlus,
  Plus,
  Send,
  Trash2,
  UploadCloud,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CompanyProfile, KnowledgeChatMessage, KnowledgeItem } from "@/types";

import { EmptyState, toDate } from "./shared";

interface ParsePreview {
  content: string;
  title: string;
  type: KnowledgeItem["type"];
  fileName?: string;
}

interface KnowledgeSectionProps {
  knowledge: KnowledgeItem[];
  instructions: KnowledgeItem[];
  loading: boolean;
  chatMessages: KnowledgeChatMessage[];
  chatInput: string;
  isChatting: boolean;
  onChatInputChange: (value: string) => void;
  onSendChat: () => void;
  chatEndRef: RefObject<HTMLDivElement>;
  newDocTitle: string;
  newDocType: KnowledgeItem["type"];
  newDocContent: string;
  isSavingDoc: boolean;
  onNewDocTitleChange: (value: string) => void;
  onNewDocTypeChange: (value: KnowledgeItem["type"]) => void;
  onNewDocContentChange: (value: string) => void;
  onAddKnowledge: () => void;
  isParsing: boolean;
  isFileLoading: boolean;
  parseError: string | null;
  parsePreview: ParsePreview | null;
  parseProfile: Partial<CompanyProfile> | null;
  onFileSelect: (file?: File | null) => void;
  onSaveParsed: () => void;
  onDiscardParsed: () => void;
  onApplyParsedProfile: () => void;
  onPreviewChange: (preview: ParsePreview) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onDelete: (id: string) => void;
  onGoToInstructions: () => void;
}

export function KnowledgeSection({
  knowledge,
  instructions,
  loading,
  chatMessages,
  chatInput,
  isChatting,
  onChatInputChange,
  onSendChat,
  chatEndRef,
  newDocTitle,
  newDocType,
  newDocContent,
  isSavingDoc,
  onNewDocTitleChange,
  onNewDocTypeChange,
  onNewDocContentChange,
  onAddKnowledge,
  isParsing,
  isFileLoading,
  parseError,
  parsePreview,
  parseProfile,
  onFileSelect,
  onSaveParsed,
  onDiscardParsed,
  onApplyParsedProfile,
  onPreviewChange,
  fileInputRef,
  onDelete,
  onGoToInstructions,
}: KnowledgeSectionProps) {
  const activeInstructions = instructions.filter((item) => item.isActive !== false);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-emerald-600" /> Describe it in your own words
            </CardTitle>
            <CardDescription>
              Write naturally. The assistant drafts a clean entry and decides whether it&apos;s reference knowledge
              or a temporary instruction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-[260px] rounded-xl border border-slate-100 bg-slate-50/40 p-4 sm:h-[300px]">
              <div className="space-y-3">
                {chatMessages.length === 0 && (
                  <div className="rounded-xl border border-slate-100 bg-white p-3.5 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Try something like:</p>
                    <p className="mt-1">&ldquo;We&apos;re open Monday to Saturday, 9 AM to 6 PM.&rdquo;</p>
                    <p className="mt-1">&ldquo;Tell callers I&apos;m sleeping and will call back after waking up.&rdquo;</p>
                  </div>
                )}
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      message.role === "user"
                        ? "ml-auto bg-emerald-600 text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-200/70",
                    )}
                  >
                    {message.text}
                    {message.createdItemId && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Saved
                      </p>
                    )}
                  </div>
                ))}
                {isChatting && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Drafting…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onSendChat();
              }}
            >
              <Input
                value={chatInput}
                onChange={(e) => onChatInputChange(e.target.value)}
                placeholder="Tell the assistant what it should know…"
                aria-label="Describe knowledge or an instruction"
              />
              <Button type="submit" size="icon" aria-label="Send" disabled={isChatting || !chatInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-600" /> Add manually or upload
            </CardTitle>
            <CardDescription>Paste text, or let the assistant extract it from a file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="Title"
                value={newDocTitle}
                onChange={(e) => onNewDocTitleChange(e.target.value)}
                aria-label="Entry title"
                className="flex-1"
              />
              <Select
                value={newDocType}
                onValueChange={(v) => onNewDocTypeChange(v as KnowledgeItem["type"])}
              >
                <SelectTrigger className="sm:w-48" aria-label="Entry type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Knowledge</SelectItem>
                  <SelectItem value="link">Link</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="doc">Document</SelectItem>
                  <SelectItem value="instruction">Active instruction</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-slate-500">
              {newDocType === "instruction"
                ? "Applied directly to new calls. Not searched like reference knowledge."
                : "Available for the assistant to reference when answering."}
            </p>

            <Textarea
              rows={4}
              placeholder={
                newDocType === "instruction"
                  ? "e.g. We're unavailable this afternoon and will call back tomorrow."
                  : "Paste details your assistant should be able to reference."
              }
              value={newDocContent}
              onChange={(e) => onNewDocContentChange(e.target.value)}
              aria-label="Entry content"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={onAddKnowledge} disabled={isSavingDoc} className="gap-1.5">
                {isSavingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {newDocType === "instruction" ? "Save instruction" : "Save knowledge"}
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.csv,image/*"
                onChange={(e) => onFileSelect(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
                disabled={isFileLoading || isParsing}
              >
                <UploadCloud className="h-4 w-4" />
                {isParsing ? "Reading file…" : "Upload file"}
              </Button>
            </div>

            {parseError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {parseError}
              </div>
            )}

            {parsePreview && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Draft from file</p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={onDiscardParsed}>
                      Discard
                    </Button>
                    <Button size="sm" onClick={onSaveParsed}>
                      Save knowledge
                    </Button>
                  </div>
                </div>
                <Input
                  value={parsePreview.title}
                  onChange={(e) => onPreviewChange({ ...parsePreview, title: e.target.value })}
                  aria-label="Draft title"
                />
                <Textarea
                  rows={5}
                  value={parsePreview.content}
                  onChange={(e) => onPreviewChange({ ...parsePreview, content: e.target.value })}
                  aria-label="Draft content"
                />
                {parseProfile && (
                  <div className="space-y-2 rounded-lg border border-emerald-200/70 bg-emerald-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                        Suggested assistant profile
                      </p>
                      <Button size="sm" variant="secondary" onClick={onApplyParsedProfile}>
                        Apply
                      </Button>
                    </div>
                    <p className="text-sm text-emerald-900">
                      {parseProfile.name || "—"}
                      {parseProfile.industry ? ` · ${parseProfile.industry}` : ""}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Knowledge</CardTitle>
              <CardDescription>
                Reference information the assistant can use when answering questions.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Database className="h-3 w-3" /> {knowledge.length}
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
              </div>
            ) : knowledge.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-5 w-5" />}
                title="No knowledge added yet"
                description="Add information your assistant can use when answering questions."
              />
            ) : (
              <ScrollArea className="h-[300px] pr-3 sm:h-[360px]">
                <ul className="divide-y divide-slate-100">
                  {knowledge.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="line-clamp-2 text-sm text-slate-600">{item.content}</p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span className="capitalize">{item.type}</span>
                          <span>·</span>
                          <span>Available to assistant</span>
                          <span>·</span>
                          <span>{toDate(item.dateAdded).toLocaleDateString()}</span>
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${item.title}`}
                        className="text-slate-500 hover:text-red-600"
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className={cn(activeInstructions.length > 0 && "border-emerald-200/70")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600" /> Active instructions
            </CardTitle>
            <CardDescription>Applied directly to new calls — separate from knowledge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeInstructions.length === 0 ? (
              <EmptyState
                icon={<Zap className="h-5 w-5" />}
                title="None active"
                description="Temporary instructions you add will show up here."
              />
            ) : (
              activeInstructions.map((item) => (
                <div key={item.id} className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                    <Badge className="bg-emerald-600 text-white">Active</Badge>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{item.content}</p>
                </div>
              ))
            )}
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onGoToInstructions}>
              <Zap className="h-3.5 w-3.5" /> Manage instructions
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default KnowledgeSection;
