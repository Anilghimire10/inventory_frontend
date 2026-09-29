'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  LifeBuoy,
  Mail,
  MessageSquarePlus,
  MessagesSquare,
  Phone,
  Send,
  X,
} from 'lucide-react';
import { SupportApi } from '@/api';
import type { SupportCategory, SupportStatus, SupportThread, SupportTicketListItem } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { SUPPORT_CATEGORIES, categoryInfo } from '@/lib/support';
import { cn } from '@/lib/utils';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';

/**
 * Help & support: questions to the platform team. Every role can ask. The
 * owner and managers see all of the shop's questions; other staff see their
 * own. A reply arrives in the asker's bell (linking to `?ticket=<id>`) and by
 * email, and either side can keep the thread going.
 */
export default function SupportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const ticketId = params.get('ticket');
  // ?ask=BILLING (from the Subscription page) opens the form with that
  // category already chosen.
  const askParam = params.get('ask');
  const askCategory = SUPPORT_CATEGORIES.some((c) => c.value === askParam) ? (askParam as SupportCategory) : null;
  const [status, setStatus] = useState<'' | SupportStatus>('');
  const [page, setPage] = useState(1);
  const [asking, setAsking] = useState(!!askCategory && !user?.impersonation);

  // "View as owner" sessions can't change anything; the API would refuse.
  const readOnly = !!user?.impersonation;
  const seesAll = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const contact = user?.subscription?.contact;

  const list = useQuery({
    queryKey: ['support', 'list', status, page],
    queryFn: () => SupportApi.list({ status: status || undefined, page, limit: 20 }),
  });

  const [guideOpen, setGuideOpen] = useState(readGuideOpen);
  const toggleGuide = (open: boolean) => {
    setGuideOpen(open);
    saveGuideOpen(open);
  };

  const openTicket = (id: string | null) =>
    router.replace(id ? `/support?ticket=${id}` : '/support', { scroll: false });

  return (
    <div>
      <PageHeader
        title="Help & support"
        description="Ask a question or report a problem. We reply here and by email."
        action={
          <Button onClick={() => setAsking(true)} disabled={readOnly}>
            <MessageSquarePlus className="h-4 w-4" /> Ask a question
          </Button>
        }
      />

      {(contact?.email || contact?.phone) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span>Need us now?</span>
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
              <Phone className="h-4 w-4" /> {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
              <Mail className="h-4 w-4" /> {contact.email}
            </a>
          )}
        </div>
      )}

      {guideOpen && <HowItWorks seesAll={seesAll} onHide={() => toggleGuide(false)} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* The list. On a phone it gives way to the open ticket. */}
        <section className={cn('min-w-0', ticketId && 'hidden lg:block')}>
          <div className="mb-3 flex items-center gap-2">
            <Select
              aria-label="Show"
              className="h-9 w-40"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | SupportStatus);
                setPage(1);
              }}
            >
              <option value="">All questions</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </Select>
            <span className="text-xs text-muted-foreground">
              {seesAll ? 'Everyone’s questions in this shop' : 'Your questions'}
            </span>
            {!guideOpen && (
              <button
                type="button"
                onClick={() => toggleGuide(true)}
                className="ml-auto text-xs font-medium text-primary hover:underline"
              >
                How support works
              </button>
            )}
          </div>

          {list.isError ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : list.isLoading || !list.data ? (
            <LoadingBlock />
          ) : list.data.data.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title={status ? 'Nothing here' : 'No questions yet'}
              description={
                status ? 'No questions with this status.' : 'Ask us anything: a problem, how to do something, or billing.'
              }
            />
          ) : (
            <>
              <Card className="divide-y divide-border overflow-hidden p-0">
                {list.data.data.map((t) => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    active={t.id === ticketId}
                    showAsker={seesAll && t.userEmail !== user?.email}
                    onOpen={() => openTicket(t.id)}
                  />
                ))}
              </Card>
              <Pagination page={list.data.meta.page} pages={list.data.meta.pages} onPage={setPage} />
            </>
          )}
        </section>

        <section className={cn('min-w-0', !ticketId && 'hidden lg:block')}>
          {ticketId ? (
            <Thread key={ticketId} id={ticketId} readOnly={readOnly} onBack={() => openTicket(null)} />
          ) : (
            <Card className="flex h-full min-h-60 flex-col items-center justify-center gap-2 p-8 text-center">
              <LifeBuoy className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Pick a question to read the conversation.</p>
            </Card>
          )}
        </section>
      </div>

      <AskDialog
        open={asking}
        initialCategory={askCategory}
        onClose={() => {
          setAsking(false);
          if (askCategory) openTicket(null);
        }}
        onAsked={(id) => openTicket(id)}
      />
    </div>
  );
}

// ---- How support works ----

const GUIDE_KEY = 'inv_support_guide_hidden';

// Open until someone hides it, and remembered per browser. Storage can be
// unavailable (private mode, a locked-down webview): then it simply shows.
function readGuideOpen(): boolean {
  try {
    return typeof window === 'undefined' || window.localStorage.getItem(GUIDE_KEY) !== '1';
  } catch {
    return true;
  }
}

function saveGuideOpen(open: boolean) {
  try {
    if (open) window.localStorage.removeItem(GUIDE_KEY);
    else window.localStorage.setItem(GUIDE_KEY, '1');
  } catch {
    // Not remembered; it shows again next visit.
  }
}

const GUIDE_STEPS = [
  {
    icon: MessageSquarePlus,
    title: 'Ask',
    text: 'Choose what it’s about, then describe it. What you did and what you saw helps most.',
  },
  {
    icon: LifeBuoy,
    title: 'We answer',
    text: 'Our support team reads every question and replies right here.',
  },
  {
    icon: Bell,
    title: 'You’re notified',
    text: 'You get a notification in the app and an email as soon as we reply.',
  },
  {
    icon: MessagesSquare,
    title: 'Keep talking',
    text: 'Reply in the same question. A closed one reopens if you write again.',
  },
];

function HowItWorks({ seesAll, onHide }: { seesAll: boolean; onHide: () => void }) {
  return (
    <Card className="relative mb-4 p-4">
      <div className="mb-3 flex items-center gap-2 pr-8">
        <h2 className="text-sm font-semibold">How support works</h2>
      </div>
      <button
        type="button"
        onClick={onHide}
        aria-label="Hide how support works"
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GUIDE_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <step.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {i + 1}. {step.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {seesAll
          ? 'As an owner or manager you can see every question from this shop. Staff see only their own.'
          : 'Only you, the shop owner and managers can see your questions.'}
      </p>
    </Card>
  );
}

// ---- Status ----

type TicketState = 'waiting' | 'replied' | 'closed';

function ticketState(t: Pick<SupportTicketListItem, 'status' | 'awaitingReply'>): TicketState {
  if (t.status === 'CLOSED') return 'closed';
  return t.awaitingReply ? 'waiting' : 'replied';
}

/** Each state's badge, and the sentence that says what happens next. */
const STATE_INFO: Record<
  TicketState,
  { label: string; tone: 'warning' | 'success' | 'muted'; icon: typeof Clock; next: string; className: string }
> = {
  waiting: {
    label: 'Waiting for support',
    tone: 'warning',
    icon: Clock,
    next: 'We’ve got your question. You’ll get a notification and an email when we reply.',
    className: 'border-warning/30 bg-warning/10',
  },
  replied: {
    label: 'Support replied',
    tone: 'success',
    icon: CheckCircle2,
    next: 'Support has replied. Write back below if you still need help.',
    className: 'border-success/30 bg-success/10',
  },
  closed: {
    label: 'Closed',
    tone: 'muted',
    icon: CheckCircle2,
    next: 'Marked as solved. If the problem is back, write again and it reopens.',
    className: 'border-border bg-muted/50',
  },
};

function StatusBadge({ ticket }: { ticket: Pick<SupportTicketListItem, 'status' | 'awaitingReply'> }) {
  const info = STATE_INFO[ticketState(ticket)];
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

function TicketRow({
  ticket,
  active,
  showAsker,
  onOpen,
}: {
  ticket: SupportTicketListItem;
  active: boolean;
  showAsker: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={cn('block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50', active && 'bg-primary/5')}
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{ticket.subject}</span>
        <StatusBadge ticket={ticket} />
      </div>
      {ticket.lastMessage && (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {ticket.lastMessage.fromAdmin ? 'Support: ' : ''}
          {ticket.lastMessage.body}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Badge tone="default">{categoryInfo(ticket.category).short}</Badge>
        {showAsker && <span>{ticket.userName}</span>}
        <span>{formatDateTime(ticket.lastMessageAt)}</span>
      </div>
    </button>
  );
}

function Thread({ id, readOnly, onBack }: { id: string; readOnly: boolean; onBack: () => void }) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [body, setBody] = useState('');

  // A reply shows up in the bell; polling keeps an open thread current too.
  const thread = useQuery({
    queryKey: ['support', 'ticket', id],
    queryFn: () => SupportApi.get(id),
    refetchInterval: 60_000,
  });

  const reply = useMutation({
    mutationFn: () => SupportApi.reply(id, body.trim()),
    onSuccess: (t: SupportThread) => {
      qc.setQueryData(['support', 'ticket', id], t);
      void qc.invalidateQueries({ queryKey: ['support', 'list'] });
      setBody('');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  if (thread.isError) return <ErrorState title="Couldn’t open this question" onRetry={() => thread.refetch()} />;
  if (thread.isLoading || !thread.data) return <LoadingBlock />;
  const t = thread.data;
  const state = {
    status: t.status,
    awaitingReply: t.status === 'OPEN' && !t.messages[t.messages.length - 1]?.fromAdmin,
  };
  const info = STATE_INFO[ticketState(state)];

  return (
    <Card className="flex flex-col p-0">
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        <Button size="icon" variant="ghost" className="-ml-2 h-8 w-8 lg:hidden" onClick={onBack} aria-label="Back to questions">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t.subject}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Badge tone="default">{categoryInfo(t.category).short}</Badge>
            <span>
              Asked by {t.userName} · {formatDateTime(t.createdAt)}
            </span>
          </div>
        </div>
        <StatusBadge ticket={state} />
      </div>

      {/* What happens next, in words, so nobody wonders whether it was received. */}
      <div className={cn('mx-4 mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', info.className)}>
        <info.icon className="mt-px h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{info.next}</span>
      </div>

      <ol className="flex flex-col gap-3 px-4 py-4">
        {t.messages.map((m) => (
          <li key={m.id} className={cn('flex flex-col', m.fromAdmin ? 'items-start' : 'items-end')}>
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm',
                m.fromAdmin ? 'rounded-bl-sm bg-muted text-foreground' : 'rounded-br-sm bg-primary/10 text-foreground',
              )}
            >
              {m.body}
            </div>
            <span className="mt-1 px-1 text-[11px] text-muted-foreground">
              {m.fromAdmin ? `${m.authorName} · Support` : m.authorName} · {formatDateTime(m.createdAt)}
            </span>
          </li>
        ))}
      </ol>

      {!readOnly && (
        <form
          className="space-y-2 border-t border-border px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) reply.mutate();
          }}
        >
          <Textarea
            aria-label="Your reply"
            rows={3}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply…"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={reply.isPending} disabled={!body.trim()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function AskDialog({
  open,
  initialCategory,
  onClose,
  onAsked,
}: {
  open: boolean;
  initialCategory: SupportCategory | null;
  onClose: () => void;
  onAsked: (id: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { show } = useToast();
  const [category, setCategory] = useState<SupportCategory | ''>(initialCategory ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const reset = () => {
    setCategory('');
    setSubject('');
    setBody('');
  };

  const ask = useMutation({
    mutationFn: () => SupportApi.create({ category: category as SupportCategory, subject: subject.trim(), body: body.trim() }),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: ['support', 'list'] });
      show('Sent. We’ll reply here and by email.');
      reset();
      onClose();
      onAsked(t.id);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const hint = category ? categoryInfo(category).hint : 'Pick the closest one; it helps us answer faster.';

  return (
    <Dialog open={open} onClose={onClose} title="Ask a question">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask.mutate();
        }}
      >
        <Field label="What is it about?">
          <Select value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)} required autoFocus>
            <option value="" disabled>
              Choose a category…
            </option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        </Field>
        <Field label="Subject">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            placeholder="e.g. Receipt printer prints blank pages"
          />
        </Field>
        <Field label="Message">
          <Textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={5000}
            placeholder="What happened, and what did you expect? Steps to repeat it help a lot."
          />
        </Field>
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Bell className="mt-px h-4 w-4 shrink-0" />
          <span>
            We’ll reply on this page. You’ll get a notification in the app
            {user?.email ? (
              <>
                {' '}
                and an email at <span className="font-medium text-foreground">{user.email}</span>
              </>
            ) : (
              ' and an email'
            )}
            .
          </span>
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={ask.isPending}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
