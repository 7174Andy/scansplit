import { useEffect, useState } from "react";
import { UserPlus, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWizardStore } from "../../store/wizardStore";
import { PersonChip } from "../../components/PersonChip";

export function Step3People({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const people = useWizardStore((s) => s.people);
  const paidByPersonId = useWizardStore((s) => s.transaction.paidByPersonId);
  const isExisting = useWizardStore((s) => s.isExisting);
  const addPerson = useWizardStore((s) => s.addPerson);
  const removePerson = useWizardStore((s) => s.removePerson);
  const setPayer = useWizardStore((s) => s.setPayer);
  const [name, setName] = useState("");

  // Self-heal: if this is a fresh (non-saved) wizard and people exist but no
  // payer is set (e.g. stale sessionStorage from before this feature landed),
  // auto-select the first person.
  useEffect(() => {
    if (!isExisting && people.length > 0 && paidByPersonId == null) {
      setPayer(people[0].id);
    }
  }, [isExisting, people, paidByPersonId, setPayer]);

  function commit() {
    const n = name.trim();
    if (!n) return;
    addPerson(n);
    setName("");
  }

  const canAdvance = people.length > 0 && paidByPersonId != null;

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          placeholder="Name"
        />
        <Button onClick={commit}>
          <UserPlus className="size-4" /> Add
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {people.map((p) => (
          <PersonChip key={p.id} name={p.name} onRemove={() => removePerson(p.id)} />
        ))}
      </div>

      {people.length > 0 && (
        <div className="mt-4">
          <label htmlFor="paid-by-trigger" className="mb-1.5 block text-sm">
            Paid by
          </label>
          <Select
            value={paidByPersonId ?? ""}
            onValueChange={(v) => setPayer(v || null)}
          >
            <SelectTrigger id="paid-by-trigger" aria-label="Paid by" className="w-full">
              <SelectValue placeholder="— Select —" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button disabled={!canAdvance} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
