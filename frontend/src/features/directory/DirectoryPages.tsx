import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useMe } from "../../api/hooks";
import type { DirectoryItem, OrganizationPublic, Paged, ProviderPublic } from "../../api/types";
import { VerificationBadge } from "../../components/safety";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Loading, PageHeader, Select } from "../../components/ui";

export function DirectoryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const page = Number(params.get("page") ?? "1");
  const query = new URLSearchParams(params);
  query.set("pageSize", "12");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["directory", params.toString()],
    queryFn: () => api.get<Paged<DirectoryItem>>(`/api/v1/directory?${query.toString()}`, { auth: false }),
    placeholderData: keepPreviousData,
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  };

  return (
    <div>
      <PageHeader title="الدليل" subtitle="جهات ومقدّمو خدمة موثّقون إدارياً. الترتيب من مطابقة بحثك وحالة التوثيق فقط — لا ترتيب مموَّل." />
      <form
        className="grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q.trim());
        }}
        role="search"
      >
        <label className="sr-only" htmlFor="dq">بحث</label>
        <Input id="dq" placeholder="ابحث باسم أو خدمة أو نطاق…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="المسار" value={params.get("track") ?? ""} onChange={(e) => setParam("track", e.target.value)}>
          <option value="">كل المسارات</option>
          {(["WaqfFree", "DawahGuidance", "LicensedHealth", "IndependentConsultant"] as const).map((k) => (
            <option key={k} value={k}>{t(`track.${k}`)}</option>
          ))}
        </Select>
        <Select aria-label="نوع الممارسة" value={params.get("practitionerType") ?? ""} onChange={(e) => setParam("practitionerType", e.target.value)}>
          <option value="">طبيب أو شيخ</option>
          <option value="LicensedPhysician">{t("practitionerType.LicensedPhysician")}</option>
          <option value="ReligiousPractitioner">{t("practitionerType.ReligiousPractitioner")}</option>
        </Select>
        <Select aria-label="طريقة التقديم" value={params.get("deliveryMode") ?? ""} onChange={(e) => setParam("deliveryMode", e.target.value)}>
          <option value="">أي طريقة</option>
          <option value="Remote">{t("deliveryMode.Remote")}</option>
          <option value="InPerson">{t("deliveryMode.InPerson")}</option>
        </Select>
        <Button type="submit" busy={isFetching}>بحث</Button>
      </form>

      <div className="mt-6">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="لا نتائج مطابقة بعد">جرّب كلمات أخرى أو أزل بعض عوامل التصفية.</EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted"><span className="num">{data.total}</span> نتيجة</p>
            <ul className="grid gap-4 md:grid-cols-2">
              {data.items.map((item) => (
                <li key={`${item.kind}-${item.id}`}><DirectoryCard item={item} /></li>
              ))}
            </ul>
            <Pagination page={page} total={data.total} pageSize={data.pageSize} onPage={(p) => { const n = new URLSearchParams(params); n.set("page", String(p)); setParams(n); }} />
          </>
        )}
      </div>
    </div>
  );
}

function DirectoryCard({ item }: { item: DirectoryItem }) {
  const { t } = useTranslation();
  const href = item.kind === "Provider" ? `/providers/${item.id}` : `/organizations/${item.id}`;
  // نمط "الرابط الممتد": الرابط داخل العنوان (اسم وصفي لقارئ الشاشة) ويغطي البطاقة كلها بصرياً
  return (
    <div className="relative h-full">
      <Card as="article" className="h-full transition-colors hover:border-primary focus-within:border-primary">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">
              <Link to={href} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
                {item.displayName}
              </Link>
            </h2>
            {item.title && <p className="text-sm text-muted">{item.title}</p>}
          </div>
          <VerificationBadge verification={item.verification} />
        </div>
        <p className="mt-3 text-sm leading-7 text-muted">{item.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="primary">{item.kind === "Organization" ? "جهة" : t(`practitionerType.${item.practitionerType}`)}</Badge>
          <Badge>{t(`track.${item.track}`)}</Badge>
          {item.deliveryMode && <Badge>{t(`deliveryMode.${item.deliveryMode}`)}</Badge>}
          {item.city && <Badge>{item.city}</Badge>}
          {item.organizationName && <Badge>ضمن: {item.organizationName}</Badge>}
        </div>
      </Card>
    </div>
  );
}

function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-2" aria-label="الصفحات">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>السابق</Button>
      <span className="num text-sm text-muted">{page} / {pages}</span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>التالي</Button>
    </nav>
  );
}

export function ProviderPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({
    queryKey: ["provider", id],
    queryFn: () => api.get<ProviderPublic>(`/api/v1/providers/${id}`, { auth: false }),
  });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error ?? new Error("غير موجود")} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="grid gap-4">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{data.displayName}</h1>
              <p className="text-muted">{data.declaredTitle}</p>
            </div>
            <VerificationBadge verification={data.verification} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="primary">{t(`practitionerType.${data.practitionerType}`)}</Badge>
            <Badge>{t(`track.${data.track}`)}</Badge>
            <Badge>{t(`deliveryMode.${data.deliveryMode}`)}</Badge>
            {data.city && <Badge>{data.city}</Badge>}
            {data.languages.map((l) => <Badge key={l}>{l}</Badge>)}
          </div>
          {data.organizationName && (
            <p className="mt-3 text-sm">ضمن جهة: <Link to={`/organizations/${data.organizationId}`} className="font-semibold text-primary">{data.organizationName}</Link></p>
          )}
        </Card>
        <Card>
          <h2 className="font-bold">نطاق الممارسة</h2>
          <p className="mt-2 whitespace-pre-line leading-8">{data.practiceScope}</p>
          <h2 className="mt-5 font-bold">حدود الممارسة المهنية</h2>
          <p className="mt-2 whitespace-pre-line leading-8 text-muted">{data.professionalBoundariesNote}</p>
        </Card>
        <section aria-labelledby="offerings">
          <h2 id="offerings" className="mb-3 text-xl font-bold">الخدمات</h2>
          {data.offerings.length === 0 ? (
            <EmptyState title="لا خدمات منشورة بعد" />
          ) : (
            <ul className="grid gap-3">
              {data.offerings.map((o) => (
                <li key={o.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold">{o.category}</h3>
                      <span className="text-sm text-muted"><span className="num">{o.sessionDurationMinutes}</span> دقيقة — مجانية</span>
                    </div>
                    <p className="mt-2 leading-8">{o.description}</p>
                    <p className="mt-2 text-sm text-muted">سياسة الإلغاء: {o.cancellationPolicy}</p>
                    {o.explicitExclusions.length > 0 && <p className="mt-1 text-sm text-muted">لا تشمل: {o.explicitExclusions.join("، ")}</p>}
                    <div className="mt-3">
                      <Link to={me ? `/book/${data.id}?offering=${o.id}` : "/login"} state={{ from: `/book/${data.id}?offering=${o.id}` }} className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">
                        احجز موعداً
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside className="grid content-start gap-4">
        <Card>
          <h2 className="font-bold">قبل الحجز</h2>
          <p className="mt-2 text-sm leading-7 text-muted">التوثيق هنا إداري فقط. سند لا تقيّم كفاءة المختص ولا تعد بنتيجة. كل الخدمات في سند مجانية.</p>
        </Card>
        {me && (
          <Card>
            <h2 className="font-bold">لاحظت مشكلة؟</h2>
            <p className="mt-2 text-sm text-muted">انتحال صفة، ادعاء علاجي، أو طلب مال — أبلغنا.</p>
            <Link to={`/report?targetType=ProviderProfile&targetId=${data.id}`} className="mt-3 inline-block text-sm font-semibold text-primary">إبلاغ</Link>
          </Card>
        )}
      </aside>
    </div>
  );
}

export function OrganizationPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["organization", id],
    queryFn: () => api.get<OrganizationPublic>(`/api/v1/organizations/${id}`, { auth: false }),
  });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error ?? new Error("غير موجود")} />;
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{data.displayName}</h1>
            {data.displayName !== data.legalName && <p className="text-muted">{data.legalName}</p>}
          </div>
          <VerificationBadge verification={data.verification} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="primary">{t(`track.${data.track}`)}</Badge>
          {data.city && <Badge>{data.city}</Badge>}
        </div>
        <p className="mt-4 whitespace-pre-line leading-8">{data.publicDescription}</p>
        {data.verificationSourceUrl && (
          <a href={data.verificationSourceUrl} target="_blank" rel="noreferrer noopener" className="mt-3 inline-block text-sm text-primary underline">مصدر التحقق الرسمي</a>
        )}
      </Card>
      <h2 className="text-xl font-bold">مقدّمو الخدمة في هذه الجهة</h2>
      {data.providers.length === 0 ? (
        <EmptyState title="لا مقدّمي خدمة منشورين بعد" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.providers.map((p) => <li key={p.id}><DirectoryCard item={p} /></li>)}
        </ul>
      )}
    </div>
  );
}
