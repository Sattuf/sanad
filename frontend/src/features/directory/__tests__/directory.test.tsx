import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServer, renderRoute, type FakeRequest } from "../../../test/harness";
import { DirectoryPage } from "../DirectoryPages";

const item = (id: string, name: string) => ({
  kind: "Provider", id, displayName: name, title: "راقٍ شرعي", track: "WaqfFree", practitionerType: "ReligiousPractitioner",
  deliveryMode: "Remote", city: "الرياض", languages: [], organizationName: null, summary: "رقية بالقرآن.",
  verification: { status: "Approved", lastCheckedAtUtc: null, expiresAtUtc: null, isConditional: false },
});

afterEach(() => vi.unstubAllGlobals());

describe("الدليل", () => {
  it("عام بلا رمز، والبحث والمسار يُرسلان للخادم، والبطاقة تفتح المختص", async () => {
    const server = fakeServer({
      "GET /api/v1/directory": (req: FakeRequest) => {
        const q = req.query.get("q");
        const items = [item("p1", "الشيخ عبدالله"), item("p2", "الشيخ سالم")].filter((i) => !q || i.displayName.includes(q));
        return { items, page: 1, pageSize: 12, total: items.length };
      },
    });
    renderRoute("/directory", "/directory", <DirectoryPage />);

    expect(await screen.findByText("الشيخ عبدالله")).toBeInTheDocument();
    expect(server.calls[0].headers.get("Authorization")).toBeNull();
    expect(screen.getAllByText("موثّق إدارياً")).toHaveLength(2);

    fireEvent.change(screen.getByPlaceholderText("ابحث باسم أو خدمة أو نطاق…"), { target: { value: "سالم" } });
    fireEvent.click(screen.getByRole("button", { name: "بحث" }));
    await waitFor(() => expect(screen.queryByText("الشيخ عبدالله")).toBeNull());
    fireEvent.change(screen.getByLabelText("المسار"), { target: { value: "DawahGuidance" } });
    await waitFor(() => expect(server.calls[server.calls.length - 1].query.get("track")).toBe("DawahGuidance"));
    expect(server.calls[server.calls.length - 1].query.get("q")).toBe("سالم");
    expect(screen.getByRole("link", { name: "الشيخ سالم" })).toHaveAttribute("href", "/providers/p2");
  });

  it("لا نتائج: حالة فارغة توجّه لتعديل البحث", async () => {
    fakeServer({ "GET /api/v1/directory": { items: [], page: 1, pageSize: 12, total: 0 } });
    renderRoute("/directory", "/directory", <DirectoryPage />);
    expect(await screen.findByText("لا نتائج مطابقة بعد")).toBeInTheDocument();
  });
});
