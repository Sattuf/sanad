import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@sanad/shared/api/core";
import { companionApi, type GroupKhatma, type InvitePreview, type KhatmaAction } from "../api/companion";
import { Btn, Colophon, Hashiya, Jadwal, Sarlawh } from "../components/ornaments";
import { Rosette } from "../components/Rosette";
import { ME, type Khatma } from "../domain/khatma";
import { ajza, ar, hijri } from "../lib/arabic";
import { track } from "../lib/events";
import { href, navigate } from "../lib/router";
import { load, save } from "../lib/storage";
import { useAccount } from "../state/account";

/*
  الختمة الجماعية (product-spec.md §2): نيّة اختيارية لا يراها إلا الأعضاء، رابط دعوة عبر واتساب، وكل عضو يختار أجزاءه
  أو يوزّعها المنشئ. البيانات من الخادم، وتُحفظ آخر نسخة للعرض دون اتصال (قراءة فقط).
*/

const errorText = (e: unknown) => (e instanceof ApiError ? e.friendly : "تعذّر الاتصال. حاول بعد قليل.");

/** تحويل ختمة الخادم إلى نموذج الوردة: جزئي ⇐ ME، جزء عضو آخر ⇐ مفتاحه، المتاح ⇐ بلا إسناد. */
export const toRosette = (k: GroupKhatma): Khatma => ({
  id: k.id,
  mode: k.mode === "Group" ? "group" : "solo",
  title: k.title,
  ownerId: "",
  members: k.members.map((m) => ({ id: m.isMe ? ME : m.memberKey, displayName: m.displayName })),
  juz: k.juz.map((j) => ({ index: j.index, assigneeId: j.isMine ? ME : (j.memberKey ?? undefined), doneAt: j.done ? "1" : undefined })),
});

export const members = (n: number) => (n === 1 ? "عضو واحد" : n === 2 ? "عضوان" : `${ar(n)} ${n % 100 >= 3 && n % 100 <= 10 ? "أعضاء" : "عضواً"}`);

export const inviteLink = (code: string) => `${window.location.origin}${window.location.pathname}#/join/${code}`;

export function GroupKhatmaScreen({ id }: { id: string }) {
  const [k, setK] = useState<GroupKhatma | null>(() => load<GroupKhatma | null>(`group:${id}`, null));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const keep = useCallback(
    (next: GroupKhatma) => {
      setK(next);
      save(`group:${id}`, next);
    },
    [id],
  );

  const refresh = useCallback(async () => {
    try {
      keep(await companionApi.khatma(id));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        save(`group:${id}`, null);
        setK(null);
      }
      setError(errorText(e));
    }
  }, [id, keep]);

  // تحديث عند الفتح وكل عشرين ثانية ما دامت الصفحة ظاهرة — لا اتصال لحظي ولا تتبّع
  useEffect(() => {
    void refresh();
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const act = async (action: KhatmaAction, juz?: number[], memberKey?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await companionApi.act(id, action, juz, memberKey);
      if (action === "Leave") {
        save(`group:${id}`, null);
        navigate({ name: "khatma" });
        return;
      }
      if (action === "MarkDone") {
        setJustDone(juz?.[0] ?? null);
        track("khatma_juz_done", "group");
        if (next.doneCount === 30 && (k?.doneCount ?? 0) < 30) track("khatma_completed", "group");
      }
      keep(next);
      setError(null);
    } catch (e) {
      setError(errorText(e));
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!k) {
    return (
      <>
        <Sarlawh title="الختمة" />
        <main>
          <p className="center-note">{error ?? "لحظة…"}</p>
          <p style={{ textAlign: "center" }}>
            <a className="link" href={href({ name: "khatma" })}>
              العودة إلى الختمة
            </a>
          </p>
        </main>
      </>
    );
  }

  const rosette = toRosette(k);
  const names = Object.fromEntries(k.members.map((m) => [m.isMe ? ME : m.memberKey, m.isMe ? "أنت" : m.displayName]));
  const mine = k.juz.filter((j) => j.isMine);
  const free = k.juz.filter((j) => !j.memberKey && !j.done).length;
  const complete = k.doneCount === 30;

  const toggle = (index: number) => {
    if (busy) return;
    const j = k.juz.find((x) => x.index === index)!;
    if (j.isMine && j.done) void act("MarkUndone", [index]);
    else if (j.isMine || !j.memberKey) void act("MarkDone", [index]);
  };

  const share = async () => {
    if (!k.inviteCode) return;
    // الرسالة لا تحمل النيّة ولا أسماء الأعضاء
    const text = `انضم إلى «${k.title}» في سند: ${inviteLink(k.inviteCode)}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setNotice("نُسخ رابط الدعوة، أرسله لأسرتك.");
      }
    } catch {
      setNotice(text);
    }
  };

  return (
    <>
      <Sarlawh title="ختمة الأسرة" />
      <main aria-labelledby="screen-title">
        <h2 style={{ textAlign: "center" }}>{k.title}</h2>
        {k.intention && <p className="center-note">{k.intention}</p>}

        <Rosette khatma={rosette} onToggle={toggle} justDone={justDone} names={names} />
        <p className="legend">
          <span><i style={{ background: "var(--leaf)" }} />أجزائي</span>{" "}
          <span><i style={{ background: "var(--lazward)", opacity: 0.7 }} />قرأها غيري</span>{" "}
          <span><i style={{ borderStyle: "dotted" }} />متاح</span>
        </p>
        <p className="center-note">انقر على جزئك حين تقرؤه، أو على جزء متاح فيصير لك.</p>

        {error && (
          <p className="error-line" role="alert">
            {error}
          </p>
        )}

        {complete ? (
          <>
            <Colophon
              label="تمّت الختمة"
              lines={["تمّت الختمة بحمد الله وتوفيقه", `في ${hijri(k.completedAtUtc ? new Date(k.completedAtUtc) : new Date(), false)}`, "نسأل الله القبول"]}
            />
            {k.isOwner && (
              <p style={{ textAlign: "center" }}>
                <button type="button" className="link" disabled={busy} onClick={() => void act("NewRound")}>
                  ابدأ ختمة جديدة مع الأعضاء أنفسهم
                </button>
              </p>
            )}
          </>
        ) : (
          <p className="center-note">
            {mine.length === 0 ? "لم تختر أجزاءً بعد." : `لك ${ajza(mine.length)}، قرأت منها ${ar(mine.filter((j) => j.done).length)}.`} {free > 0 ? `المتاح ${ajza(free)}.` : "لا أجزاء متاحة."}
          </p>
        )}

        <h3>الأعضاء</h3>
        <div className="members">
          {k.members.map((m, i) => (
            <div key={m.memberKey} className={`ruled-row${i === 0 ? " first" : ""}`}>
              <span>
                {m.isMe ? "أنت" : m.displayName}
                {m.isOwner && <span className="plan-sub"> — المنشئ</span>}
              </span>
              <span className="plan-sub">
                {m.assignedJuz === 0 ? "لم يختر بعد" : `${ar(m.doneJuz)} من ${ajza(m.assignedJuz)}`}
                {k.isOwner && !m.isMe && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="link"
                      disabled={busy}
                      onClick={() => window.confirm(`إزالة ${m.displayName} من الختمة؟`) && void act("RemoveMember", undefined, m.memberKey)}
                    >
                      أزِل
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>

        {k.isOwner && k.inviteCode && (
          <>
            <h3>ادعُ أسرتك</h3>
            <p>
              رمز الدعوة: <span className="invite-code">{k.inviteCode}</span>
            </p>
            <div className="row-actions">
              <Btn onClick={() => void share()}>ادعُ أسرتك للختمة</Btn>
              <a className="link" href={`https://wa.me/?text=${encodeURIComponent(`انضم إلى «${k.title}» في سند: ${inviteLink(k.inviteCode)}`)}`} target="_blank" rel="noreferrer">
                عبر واتساب
              </a>
            </div>
            {notice && (
              <p className="plan-sub" role="status" style={{ marginTop: ".5rem" }}>
                {notice}
              </p>
            )}
          </>
        )}

        <div className="row-actions" style={{ marginTop: "1.5rem" }}>
          {k.isOwner ? (
            <>
              {free > 0 && (
                <button type="button" className="link" disabled={busy} onClick={() => void act("Distribute")}>
                  وزّع الأجزاء المتاحة على الأعضاء
                </button>
              )}
              <button type="button" className="link" disabled={busy} onClick={() => window.confirm("تجديد الرمز يُبطل الرابط القديم. متابعة؟") && void act("RotateInvite")}>
                جدّد رابط الدعوة
              </button>
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("حذف الختمة نهائياً لك ولكل أعضائها؟")) return;
                  try {
                    await companionApi.deleteKhatma(id);
                    save(`group:${id}`, null);
                    navigate({ name: "khatma" });
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                احذف الختمة
              </button>
            </>
          ) : (
            <button type="button" className="link" disabled={busy} onClick={() => window.confirm("مغادرة الختمة؟ أجزاؤك غير المقروءة تعود متاحة.") && void act("Leave")}>
              غادر الختمة
            </button>
          )}
        </div>

        <Hashiya>
          <p>النيّة لا يراها إلا أعضاء الختمة، ولا تظهر في الدعوة ولا في الإشعارات. يصلك إشعار واحد عند تمام الختمة.</p>
        </Hashiya>
      </main>
    </>
  );
}

/** نموذج إنشاء ختمة جماعية — يظهر في صفحة الختمة لمن دخل حسابه. */
export function NewGroupKhatma({ onCreated }: { onCreated: (k: GroupKhatma) => void }) {
  const { displayName } = useAccount();
  const [title, setTitle] = useState("ختمة الأسرة");
  const [intention, setIntention] = useState("");
  const [name, setName] = useState(displayName ?? "");
  useEffect(() => {
    if (displayName) setName((n) => n || displayName);
  }, [displayName]);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await companionApi.createKhatma({ mode: "Group", title, intention: intention.trim() || null, targetDate: target || null, displayName: name }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label>
        عنوان الختمة
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
      </label>
      <label>
        النيّة (اختيارية)
        <textarea value={intention} onChange={(e) => setIntention(e.target.value)} maxLength={200} placeholder="على نية…" />
        <span className="hint">يراها أعضاء الختمة فقط، ولا تظهر في الدعوة ولا في الإشعارات.</span>
      </label>
      <label>
        اسمك كما يراه الأعضاء
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
      </label>
      <label>
        نختم قبل (اختياري)
        <input type="date" value={target} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setTarget(e.target.value)} />
      </label>
      {error && (
        <p className="error-line" role="alert">
          {error}
        </p>
      )}
      <div>
        <Btn submit disabled={busy}>
          أنشئ الختمة
        </Btn>
      </div>
    </form>
  );
}

/** صفحة الدعوة: معاينة (العنوان وعدد الأعضاء فقط) ثم الانضمام باسم يختاره المدعوّ. */
export function JoinKhatma({ code }: { code: string }) {
  const { signedIn, displayName } = useAccount();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(displayName ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (displayName) setName((n) => n || displayName);
  }, [displayName]);

  useEffect(() => {
    if (!signedIn) {
      // بعد الدخول يعود إلى هذه الدعوة تلقائياً
      save("pendingJoin", code);
      return;
    }
    save("pendingJoin", null);
    companionApi.preview(code).then(
      (p) => {
        setPreview(p);
        if (p.alreadyMember && p.khatmaId) navigate({ name: "group", id: p.khatmaId });
      },
      (e) => setError(e instanceof ApiError && e.status === 404 ? "رابط الدعوة غير صالح أو جُدّد. اطلب رابطاً جديداً." : errorText(e)),
    );
  }, [code, signedIn]);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const k = await companionApi.join(code, name);
      track("khatma_invite_accepted", "group");
      navigate({ name: "group", id: k.id });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sarlawh title="دعوة إلى ختمة" />
      <main aria-labelledby="screen-title">
        <Jadwal label="الدعوة">
          {!signedIn ? (
            <>
              <p className="plan-name">دُعيت إلى ختمة</p>
              <p className="meta">للانضمام إلى ختمة مع غيرك ادخل إلى حسابك أو أنشئ حساباً، ثم افتح الرابط من جديد.</p>
              <Btn to={{ name: "account" }}>ادخل إلى حسابك</Btn>
            </>
          ) : error ? (
            <p className="error-line" role="alert">
              {error}
            </p>
          ) : !preview ? (
            <p className="meta">لحظة…</p>
          ) : (
            <form className="form" onSubmit={join}>
              <p className="plan-name">{preview.title}</p>
              <p className="meta">
                فيها {members(preview.memberCount)}، {preview.doneCount === 0 ? "ولم يُقرأ منها شيء بعد" : `وقُرئ منها ${ajza(preview.doneCount)}`}.
              </p>
              <label>
                اسمك كما يراه الأعضاء
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
              </label>
              <div>
                <Btn submit disabled={busy}>
                  انضم إلى الختمة
                </Btn>
              </div>
            </form>
          )}
        </Jadwal>
      </main>
    </>
  );
}
