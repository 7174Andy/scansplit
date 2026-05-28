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
      items: [
        { raw: "PASTA", name: "Pasta", priceCents: 1400, kind: "item" },
        { raw: "TAX", name: null, priceCents: 100, kind: "tax" },
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
    });
    useWizardStore.getState().removePerson(alice.id);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([bob.id]);
  });

  it("setScanStage records the current stage for a receipt", () => {
    useWizardStore.getState().addReceipt({
      id: "r1", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().setScanStage("r1", "anthropic");
    expect(useWizardStore.getState().scanStage["r1"]).toBe("anthropic");
  });

  it("setScanStatus('ok') clears scanStage for the receipt", () => {
    useWizardStore.getState().addReceipt({
      id: "r2", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().setScanStage("r2", "finalize");
    useWizardStore.getState().setScanStatus("r2", "ok");
    expect(useWizardStore.getState().scanStage["r2"]).toBeUndefined();
  });

  it("setScanStatus('error') clears scanStage for the receipt", () => {
    useWizardStore.getState().addReceipt({
      id: "r3", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().setScanStage("r3", "anthropic");
    useWizardStore.getState().setScanStatus("r3", "error", "boom");
    expect(useWizardStore.getState().scanStage["r3"]).toBeUndefined();
  });

  it("removeReceipt clears scanStage for the receipt", () => {
    useWizardStore.getState().addReceipt({
      id: "r4", transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().setScanStage("r4", "anthropic");
    useWizardStore.getState().removeReceipt("r4");
    expect(useWizardStore.getState().scanStage["r4"]).toBeUndefined();
  });
});
