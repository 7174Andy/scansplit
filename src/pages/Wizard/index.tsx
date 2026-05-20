import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/Stepper";
import { Step1Scan } from "./Step1Scan";
import { Step2Items } from "./Step2Items";
import { Step3People } from "./Step3People";
import { Step4Assign } from "./Step4Assign";
import { Step5Result } from "./Step5Result";

const STEP_LABELS = ["Scan", "Items", "People", "Assign", "Result"];

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Button variant="ghost" onClick={() => navigate("/")}>
        <ArrowLeft className="size-4" /> Cancel
      </Button>
      <Stepper steps={STEP_LABELS} current={step} />

      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <Step2Items onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <Step3People onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && <Step4Assign onBack={() => setStep(3)} onNext={() => setStep(5)} />}
      {step === 5 && <Step5Result onBack={() => setStep(4)} />}
    </div>
  );
}
