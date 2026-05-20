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
});
