import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServer, renderRoute, signIn, signOutLocally, type FakeRequest } from "../../../test/harness";
import { MyRecommendationsPage } from "../../patient-care/MyRecommendations";
import { ConversationPage } from "../ConversationPage";

const conversation = (status = "Active") => ({ id: "c1", bookingRequestId: "b1", status, lastMessageAtUtc: null, counterpartDisplayName: "الشيخ عبدالله" });
const message = (id: string, body: string, isMine: boolean) => ({
  id, conversationId: "c1", senderUserId: isMine ? "u1" : "p", isMine, body, status: "Sent", sentAtUtc: "2026-10-20T07:00:00Z",
});

beforeEach(() => signIn());
afterEach(() => {
  signOutLocally();
  vi.unstubAllGlobals();
});

describe("المحادثة الإدارية", () => {
  it("الرسائل نص حرفي، والإرسال يقصّ الفراغات ويعيد الجلب، والتحذير ظاهر", async () => {
    const messages = [message("m1", "<img src=x onerror=alert(1)>", false)];
    const server = fakeServer({
      "GET /api/v1/me/conversations": [conversation()],
      "GET /api/v1/conversations/c1/messages": () => messages,
      "POST /api/v1/conversations/c1/messages": (req: FakeRequest) => {
        messages.push(message("m2", (req.body as { body: string }).body, true));
        return { id: "m2", conversationId: "c1", sentAtUtc: "2026-10-20T08:00:00Z" };
      },
    });
    const { container } = renderRoute("/conversations/c1", "/conversations/:id", <ConversationPage />);

    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(screen.getByText(/وليست مراقَبة لحظياً/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "محادثة مع الشيخ عبدالله" })).toBeInTheDocument();

    const send = screen.getByRole("button", { name: "إرسال" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("رسالتك"), { target: { value: "  وعليكم السلام  " } });
    fireEvent.click(send);
    await waitFor(() => expect(server.to("POST /api/v1/conversations/c1/messages")).toHaveLength(1));
    expect(server.to("POST /api/v1/conversations/c1/messages")[0].body).toEqual({ body: "وعليكم السلام" });
    expect(await screen.findByText("وعليكم السلام")).toBeInTheDocument();
    expect(screen.getByLabelText("رسالتك")).toHaveValue("");
  });

  it("المحادثة المقيّدة لا تقبل رسائل، والبلاغ يُرسل بنوعه ووصفه", async () => {
    const server = fakeServer({
      "GET /api/v1/me/conversations": [conversation("Restricted")],
      "GET /api/v1/conversations/c1/messages": [],
      "POST /api/v1/conversations/c1/report": { id: "r1" },
    });
    renderRoute("/conversations/c1", "/conversations/:id", <ConversationPage />);

    expect(await screen.findByText("هذه المحادثة مقيّدة إدارياً ولا تقبل رسائل جديدة.")).toBeInTheDocument();
    expect(screen.getByLabelText("رسالتك")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "إبلاغ" }));
    fireEvent.change(screen.getByLabelText("نوع المشكلة"), { target: { value: "FinancialExploitation" } });
    fireEvent.change(screen.getByLabelText("وصف مختصر"), { target: { value: "  طلب مالاً  " } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال البلاغ" }));
    expect(await screen.findByText("وصل بلاغك")).toBeInTheDocument();
    expect(server.to("POST /api/v1/conversations/c1/report")[0].body).toEqual({ category: "FinancialExploitation", severity: "Medium", description: "طلب مالاً" });
  });

  it("رسالة يرفضها الخادم تظهر بسببها ولا تُفقد", async () => {
    fakeServer({
      "GET /api/v1/me/conversations": [conversation()],
      "GET /api/v1/conversations/c1/messages": [],
      "POST /api/v1/conversations/c1/messages": { status: 403, body: { title: "لم يعد بإمكانك المراسلة في هذا الحجز." } },
    });
    renderRoute("/conversations/c1", "/conversations/:id", <ConversationPage />);
    fireEvent.change(await screen.findByLabelText("رسالتك"), { target: { value: "مرحباً" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("لم يعد بإمكانك المراسلة في هذا الحجز.");
    expect(screen.getByLabelText("رسالتك")).toHaveValue("مرحباً");
  });
});

describe("توصياتي", () => {
  it("التوجيه نص حرفي، و«تم الاطّلاع» يُسجَّل ثم يظهر كشارة", async () => {
    let acknowledged: string | null = null;
    const server = fakeServer({
      "GET /api/v1/me/recommendations": () => [
        {
          id: "r1", bookingRequestId: "b1", providerDisplayName: "الشيخ عبدالله", guidanceText: "<script>x</script> المحافظة على الأذكار",
          recommendedTracks: [], recordedAtUtc: "2026-10-20T07:00:00Z", acknowledgedAtUtc: acknowledged,
        },
      ],
      "POST /api/v1/me/recommendations/r1/acknowledge": () => {
        acknowledged = "2026-10-20T09:00:00Z";
        return { status: 204 };
      },
    });
    renderRoute("/recommendations", "/recommendations", <MyRecommendationsPage />);
    expect(await screen.findByText("<script>x</script> المحافظة على الأذكار")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تم الاطّلاع" }));
    expect(await screen.findByText("اطّلعت عليها")).toBeInTheDocument();
    expect(server.to("POST /api/v1/me/recommendations/r1/acknowledge")).toHaveLength(1);
  });

  it("بلا توصيات: حالة فارغة توضّح متى تصل", async () => {
    fakeServer({ "GET /api/v1/me/recommendations": [] });
    renderRoute("/recommendations", "/recommendations", <MyRecommendationsPage />);
    expect(await screen.findByText("لا توصيات بعد")).toBeInTheDocument();
  });
});
