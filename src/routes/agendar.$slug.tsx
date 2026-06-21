import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  Clock,
  User,
  Scissors,
  Check,
  ChevronLeft,
  Sparkles,
  MapPin,
  Phone,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { toStoragePhone, formatPhoneBR } from "@/lib/phone";
import { toast } from "sonner";

export const Route = createFileRoute("/agendar/$slug")({
  head: (ctx) => {
    const company = (ctx as { loaderData?: { company?: { name?: string } } }).loaderData?.company;
    const name = company?.name ?? "BeautyFlow";
    return {
      meta: [
        { title: `Agendar — ${name}` },
        { name: "description", content: `Agende online com ${name} em poucos cliques.` },
        { name: "robots", content: "index, follow" },
      ],
    };
  },
  loader: async ({ params }) => {
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, slug, logo_url, address, city, state, vertical")
      .eq("slug", params.slug)
      .eq("active", true)
      .eq("onboarding_completed", true)
      .maybeSingle();
    if (!company) throw notFound();
    return { company };
  },
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Esse link de agendamento não existe ou foi desativado.
        </p>
        <Button className="mt-4" onClick={() => window.history.back()}>
          Voltar para a página anterior
        </Button>
      </div>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {(error as Error)?.message ?? "Erro inesperado"}
        </p>
        <Button className="mt-4" onClick={() => reset()}>
          Tentar novamente
        </Button>
      </div>
    </div>
  ),
  component: BookingPage,
});

type Step = "service" | "professional" | "time" | "info" | "done";

type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  description: string | null;
};
type Professional = { id: string; name: string; color: string; specialty: string | null };

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function BookingPage() {
  const { company } = Route.useLoaderData() as any;
  const [step, setStep] = useState<Step>("service");

  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const service = selectedServices[0] || null;

  const totalDuration = useMemo(() => {
    return selectedServices.reduce((acc, s) => acc + s.duration_minutes, 0);
  }, [selectedServices]);

  const totalPrice = useMemo(() => {
    return selectedServices.reduce((acc, s) => acc + Number(s.price), 0);
  }, [selectedServices]);

  const [professional, setProfessional] = useState<Professional | null>(null);
  const [dateCursor, setDateCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    { start: string; end: string; professional_id: string | null }[]
  >([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ when: Date } | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingMeta(true);
      const [s, p] = await Promise.all([
        supabase
          .from("services")
          .select("id, name, duration_minutes, price, description")
          .eq("company_id", company.id)
          .eq("active", true)
          .eq("kind", "SERVICE")
          .order("name"),
        supabase
          .from("professionals")
          .select("id, name, color, specialty")
          .eq("company_id", company.id)
          .eq("active", true)
          .order("name"),
      ]);
      setServices((s.data ?? []) as Service[]);
      setProfessionals((p.data ?? []) as Professional[]);
      setLoadingMeta(false);
    })();
  }, [company.id]);

  // Load busy slots for the chosen week + professional
  useEffect(() => {
    if (step !== "time") return;
    (async () => {
      setLoadingSlots(true);
      const from = new Date(dateCursor);
      from.setHours(0, 0, 0, 0);
      const to = addDays(from, 7);
      let q = supabase
        .from("v_public_busy_slots")
        .select("start_datetime, end_datetime, professional_id")
        .eq("company_id", company.id)
        .gte("start_datetime", from.toISOString())
        .lt("start_datetime", to.toISOString());
      if (professional?.id) q = q.eq("professional_id", professional.id);
      const { data } = await q;
      setBusy(
        (data ?? []).map((r) => ({
          start: r.start_datetime as string,
          end: r.end_datetime as string,
          professional_id: (r as any).professional_id,
        })),
      );
      setLoadingSlots(false);
    })();
  }, [step, dateCursor, professional?.id, company.id]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(dateCursor, i)),
    [dateCursor],
  );

  function slotsFor(day: Date): { time: string; iso: string; free: boolean }[] {
    if (selectedServices.length === 0) return [];
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(day);
    end.setHours(19, 0, 0, 0);
    const out: { time: string; iso: string; free: boolean }[] = [];
    const stepMs = 30 * 60 * 1000;
    const durMs = totalDuration * 60 * 1000;
    for (let t = start.getTime(); t + durMs <= end.getTime(); t += stepMs) {
      const slotStart = t,
        slotEnd = t + durMs;
      const overlaps = busy.some((b) => {
        const bs = new Date(b.start).getTime(),
          be = new Date(b.end).getTime();
        return slotStart < be && slotEnd > bs;
      });
      const inPast = slotStart < Date.now() + 30 * 60 * 1000;
      const d = new Date(slotStart);
      out.push({
        time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        iso: d.toISOString(),
        free: !overlaps && !inPast,
      });
    }
    return out;
  }

  async function submitBooking() {
    if (selectedServices.length === 0 || !selectedTime || !name.trim() || !phone.trim()) {
      toast.error("Preencha todos os campos.");
      return;
    }
    setSubmitting(true);
    try {
      const phoneNorm = toStoragePhone(phone) ?? phone;
      
      const { data, error } = await supabase.rpc("create_online_booking" as any, {
        p_data: {
          p_company_id: company.id,
          p_client_name: name.trim(),
          p_client_phone: phoneNorm,
          p_client_email: email.trim() || null,
          p_service_ids: selectedServices.map((s) => s.id),
          p_professional_id: professional?.id ?? null,
          p_start_time: selectedTime,
          p_notes: notes.trim() || null,
        }
      });

      if (error) throw error;

      setConfirmation({ when: new Date(selectedTime) });
      setStep("done");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Não foi possível agendar. Tente outro horário.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-card/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {step !== "service" && step !== "done" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -ml-1 rounded-full text-muted-foreground hover:text-foreground flex-shrink-0"
              onClick={() => {
                if (step === "professional") setStep("service");
                else if (step === "time") setStep(professionals.length > 0 ? "professional" : "service");
                else if (step === "info") setStep("time");
              }}
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="sr-only">Voltar</span>
            </Button>
          )}
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg gradient-primary grid place-items-center text-primary-foreground flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate">{company.name}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2 truncate">
              {company.city && (
                <>
                  <MapPin className="h-3 w-3" />
                  {company.city}
                  {company.state ? `/${company.state}` : ""}
                </>
              )}
              {company.phone && (
                <>
                  <Phone className="h-3 w-3 ml-2" />
                  {formatPhoneBR(company.phone)}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <Stepper step={step} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 pb-24 space-y-4">
        {step === "service" && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold mb-3">Escolha os serviços</h2>
            {loadingMeta ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : services.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground">
                Sem serviços disponíveis no momento.
              </Card>
            ) : (
              <>
                <ul className="space-y-2">
                  {services.map((s) => {
                    const isSelected = selectedServices.some(item => item.id === s.id);
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => {
                            setSelectedServices(prev => {
                              const exists = prev.some(item => item.id === s.id);
                              if (exists) {
                                return prev.filter(item => item.id !== s.id);
                              } else {
                                return [...prev, s];
                              }
                            });
                          }}
                          className="w-full text-left"
                        >
                          <Card className={`p-4 transition flex items-center gap-3 border ${isSelected ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}>
                            <div className="h-10 w-10 rounded-lg bg-secondary grid place-items-center text-primary">
                              <Scissors className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{s.duration_minutes} min</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-primary tabular-nums">
                                {formatBRL(Number(s.price))}
                              </span>
                              {isSelected && (
                                <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground grid place-items-center">
                                  <Check className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                          </Card>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="pt-2">
                  <Button
                    onClick={() => {
                      setStep(professionals.length > 0 ? "professional" : "time");
                    }}
                    disabled={selectedServices.length === 0}
                    className="w-full h-11"
                  >
                    Avançar com {selectedServices.length} {selectedServices.length === 1 ? "serviço" : "serviços"}
                  </Button>
                </div>
              </>
            )}
          </section>
        )}

        {step === "professional" && (
          <section>
            <BackBtn onClick={() => setStep("service")} />
            <h2 className="text-lg font-semibold mb-3">Escolha a profissional</h2>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => {
                    setProfessional(null);
                    setStep("time");
                  }}
                  className="w-full text-left"
                >
                  <Card className="p-4 hover:border-primary/40 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted grid place-items-center">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Sem preferência</p>
                      <p className="text-xs text-muted-foreground">
                        Qualquer profissional disponível
                      </p>
                    </div>
                  </Card>
                </button>
              </li>
              {professionals.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setProfessional(p);
                      setStep("time");
                    }}
                    className="w-full text-left"
                  >
                    <Card className="p-4 hover:border-primary/40 flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-full grid place-items-center text-white font-semibold"
                        style={{ background: p.color }}
                      >
                        {p.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{p.name}</p>
                        {p.specialty && (
                          <p className="text-xs text-muted-foreground">{p.specialty}</p>
                        )}
                      </div>
                    </Card>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === "time" && selectedServices.length > 0 && (
          <section>
            <BackBtn
              onClick={() => setStep(professionals.length > 0 ? "professional" : "service")}
            />
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Escolha o horário</h2>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDateCursor(addDays(dateCursor, -7))}
                >
                  ‹
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDateCursor(addDays(dateCursor, 7))}
                >
                  ›
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-4">
              {weekDays.map((d) => {
                const isSel = selectedDate && toISODate(d) === toISODate(selectedDate);
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => setSelectedDate(d)}
                    className={`p-2 rounded-lg text-center text-xs ${isSel ? "bg-primary text-primary-foreground" : "bg-card border hover:border-primary/40"}`}
                  >
                    <div className="opacity-70">
                      {d.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3)}
                    </div>
                    <div className="font-semibold">{d.getDate()}</div>
                  </button>
                );
              })}
            </div>
            {!selectedDate ? (
              <p className="text-sm text-muted-foreground">
                Selecione um dia para ver os horários.
              </p>
            ) : loadingSlots ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slotsFor(selectedDate).map((s) => (
                  <button
                    key={s.iso}
                    disabled={!s.free}
                    onClick={() => {
                      setSelectedTime(s.iso);
                      setStep("info");
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition
                      ${s.free ? "bg-card hover:border-primary hover:text-primary" : "bg-muted text-muted-foreground line-through cursor-not-allowed"}`}
                  >
                    {s.time}
                  </button>
                ))}
                {slotsFor(selectedDate).length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">
                    Sem horários nesse dia.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {step === "info" && selectedServices.length > 0 && selectedTime && (
          <section>
            <BackBtn onClick={() => setStep("time")} />
            <h2 className="text-lg font-semibold mb-3">Seus dados</h2>
            <Card className="p-4 mb-4 bg-accent/40 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Serviços Selecionados</div>
                <div className="mt-1.5 space-y-2 max-h-40 overflow-y-auto">
                  {selectedServices.map((s) => (
                    <div key={s.id} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Scissors className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="truncate">{s.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {s.duration_minutes} min · <span className="font-semibold text-foreground">{formatBRL(Number(s.price))}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-2 flex justify-between items-center text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                <span>Total ({selectedServices.length} {selectedServices.length === 1 ? "serviço" : "serviços"}) · {totalDuration} min</span>
                <span className="text-sm font-bold text-foreground">{formatBRL(totalPrice)}</span>
              </div>
              <div className="border-t pt-2 space-y-1.5 text-sm">
                {professional && (
                  <p className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-primary" />
                    {professional.name}
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  {new Date(selectedTime).toLocaleString("pt-BR", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </Card>
            <div className="space-y-3">
              <div>
                <Label>Nome completo</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como você se chama?"
                />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                />
              </div>
              <div>
                <Label>E-mail (opcional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                />
              </div>
              <div>
                <Label>Observações (opcional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Algo que devemos saber?"
                />
              </div>
              <Button onClick={submitBooking} disabled={submitting} className="w-full h-11 mt-2">
                {submitting ? "Confirmando…" : "Confirmar agendamento"}
              </Button>
            </div>
          </section>
        )}

        {step === "done" && confirmation && (
          <section className="text-center py-10">
            <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 grid place-items-center mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-semibold mb-1">Tudo certo!</h2>
            <p className="text-sm text-muted-foreground">
              Seu agendamento foi confirmado para
              <br />
              <span className="font-medium text-foreground">
                {confirmation.when.toLocaleString("pt-BR", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </span>
            </p>
            <Badge className="mt-4" variant="secondary">
              Confirmação será enviada no WhatsApp
            </Badge>
          </section>
        )}
      </main>

      <footer className="text-center py-4 text-xs text-muted-foreground">
        Powered by <span className="font-semibold text-primary">BeautyFlow</span>
      </footer>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 h-8"
    >
      <ChevronLeft className="h-4 w-4" /> Voltar ao passo anterior
    </Button>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string; icon: typeof Scissors }[] = [
    { key: "service", label: "Serviço", icon: Scissors },
    { key: "professional", label: "Profissional", icon: User },
    { key: "time", label: "Horário", icon: Clock },
    { key: "info", label: "Dados", icon: Sparkles },
  ];
  const idx = Math.max(
    0,
    steps.findIndex((s) => s.key === step),
  );
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1">
          <div className={`h-1.5 rounded-full flex-1 ${i <= idx ? "bg-primary" : "bg-muted"}`} />
        </div>
      ))}
    </div>
  );
}
