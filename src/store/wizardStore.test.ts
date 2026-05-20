import { describe, it, expect, beforeEach } from "vitest";
import { useWizardStore } from "./wizardStore";

describe("wizardStore", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  it("mergeParsed creates items with default empty assignment", () => {
    const rid = "r1";
    useWizardStore.getState().addReceipt({
      id: rid, transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().mergeParsed(rid, {
      merchant: "Trattoria",
      totalsReconciled: true,
      items: [
        { raw: "PASTA", name: "Pasta", priceCents: 1400, kind: "item", confidence: "high", confidenceReasons: [] },
        { raw: "TAX", name: null, priceCents: 100, kind: "tax", confidence: "high", confidenceReasons: [] },
      ],
    });
    const items = useWizardStore.getState().items;
    expect(items.length).toBe(2);
    expect(items[0].assignedPersonIds).toEqual([]);
    expect(items[1].kind).toBe("tax");
    expect(useWizardStore.getState().detectedMerchant).toBe("Trattoria");
  });

  it("toggleAssignment adds and removes person ids", () => {
    const store = useWizardStore.getState();
    store.addPerson("Alice");
    store.addItem({
      id: "i1", transactionId: "t", name: "Pasta", priceCents: 1400,
      kind: "item", position: 0, assignedPersonIds: [],
      confidence: "high", confidenceReasons: [],
    });
    const aliceId = useWizardStore.getState().people[0].id;
    useWizardStore.getState().toggleAssignment("i1", aliceId);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([aliceId]);
    useWizardStore.getState().toggleAssignment("i1", aliceId);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([]);
  });

  it("toggleAssignment canonicalizes 'all selected' back to []", () => {
    const s = useWizardStore.getState();
    s.addPerson("Alice");
    s.addPerson("Bob");
    const [alice, bob] = useWizardStore.getState().people;
    s.addItem({
      id: "i1", transactionId: "t", name: "Pasta", priceCents: 1400,
      kind: "item", position: 0, assignedPersonIds: [alice.id],
      confidence: "high", confidenceReasons: [],
    });
    useWizardStore.getState().toggleAssignment("i1", bob.id);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([]);
  });

  it("toggleAssignment on an 'all selected' item deselects just that person", () => {
    const s = useWizardStore.getState();
    s.addPerson("Alice");
    s.addPerson("Bob");
    const [alice, bob] = useWizardStore.getState().people;
    s.addItem({
      id: "i1", transactionId: "t", name: "Pasta", priceCents: 1400,
      kind: "item", position: 0, assignedPersonIds: [],
      confidence: "high", confidenceReasons: [],
    });
    useWizardStore.getState().toggleAssignment("i1", alice.id);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([bob.id]);
  });

  it("removePerson cascades to item assignments", () => {
    const s = useWizardStore.getState();
    s.addPerson("Alice");
    s.addPerson("Bob");
    const [alice, bob] = useWizardStore.getState().people;
    s.addItem({
      id: "i1", transactionId: "t", name: "Wine", priceCents: 3000,
      kind: "item", position: 0,
      assignedPersonIds: [alice.id, bob.id],
      confidence: "high", confidenceReasons: [],
    });
    useWizardStore.getState().removePerson(alice.id);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([bob.id]);
  });

  it("setItem with a name change resets confidence to high and clears reasons", () => {
    const s = useWizardStore.getState();
    s.addItem({
      id: "i1", transactionId: "t", name: "Late", priceCents: 500,
      kind: "item", position: 0, assignedPersonIds: [],
      confidence: "low", confidenceReasons: ["misread name"],
    });
    s.setItem("i1", { name: "Latte" });
    const item = useWizardStore.getState().items[0];
    expect(item.name).toBe("Latte");
    expect(item.confidence).toBe("high");
    expect(item.confidenceReasons).toEqual([]);
  });

  it("setItem with a price change resets confidence to high and clears reasons", () => {
    const s = useWizardStore.getState();
    s.addItem({
      id: "i1", transactionId: "t", name: "Latte", priceCents: 0,
      kind: "item", position: 0, assignedPersonIds: [],
      confidence: "low", confidenceReasons: ["price missing"],
    });
    s.setItem("i1", { priceCents: 525 });
    const item = useWizardStore.getState().items[0];
    expect(item.priceCents).toBe(525);
    expect(item.confidence).toBe("high");
    expect(item.confidenceReasons).toEqual([]);
  });

  it("setItem with an unrelated patch (kind change) does NOT touch confidence", () => {
    const s = useWizardStore.getState();
    s.addItem({
      id: "i1", transactionId: "t", name: "Tax", priceCents: 100,
      kind: "item", position: 0, assignedPersonIds: [],
      confidence: "medium", confidenceReasons: ["needs review"],
    });
    s.setItem("i1", { kind: "tax" });
    const item = useWizardStore.getState().items[0];
    expect(item.kind).toBe("tax");
    expect(item.confidence).toBe("medium");
    expect(item.confidenceReasons).toEqual(["needs review"]);
  });

  it("loadFrom tolerates items without confidence fields (legacy saved transactions)", () => {
    const s = useWizardStore.getState();
    s.loadFrom({
      transaction: { id: "t1", title: "Old split", currency: "USD", createdAt: 0, updatedAt: 0 },
      receipts: [],
      people: [],
      items: [
        {
          id: "i1", transactionId: "t1", receiptId: null,
          rawCode: null, name: "Legacy item", priceCents: 1000,
          kind: "item", position: 0, assignedPersonIds: [],
          // No confidence/confidenceReasons — simulating older saved data
        } as any,
      ],
    });
    // Should not throw on read
    const item = useWizardStore.getState().items[0];
    expect(item.name).toBe("Legacy item");
  });

  it("replaceParsed drops existing items for that receipt and inserts new ones", () => {
    const s = useWizardStore.getState();
    s.addReceipt({ id: "r1", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0 });
    s.addReceipt({ id: "r2", transactionId: "t", imagePath: "/y", position: 1, scannedAt: 0 });
    s.mergeParsed("r1", {
      merchant: null,
      totalsReconciled: true,
      items: [
        { raw: "Old", name: "Old", priceCents: 100, kind: "item", confidence: "low", confidenceReasons: ["x"] },
      ],
    });
    s.mergeParsed("r2", {
      merchant: null,
      totalsReconciled: true,
      items: [
        { raw: "Keep", name: "Keep", priceCents: 200, kind: "item", confidence: "high", confidenceReasons: [] },
      ],
    });
    s.replaceParsed("r1", {
      merchant: null,
      totalsReconciled: true,
      items: [
        { raw: "New", name: "New", priceCents: 500, kind: "item", confidence: "high", confidenceReasons: [] },
      ],
    });
    const items = useWizardStore.getState().items;
    // r1's Old is gone, replaced with New. r2's Keep is untouched.
    expect(items.find((i) => i.name === "Old")).toBeUndefined();
    expect(items.find((i) => i.name === "New")).toBeDefined();
    expect(items.find((i) => i.name === "Keep")).toBeDefined();
  });
});
