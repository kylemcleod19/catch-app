import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import PathSelector from "@/components/plan/PathSelector";
import PlannerChat from "@/components/plan/PlannerChat";
import GuidedPlanner from "@/components/plan/GuidedPlanner";
import type { ChatDetails } from "@/lib/planTrip";

type Mode = "path" | "chat" | "guided";

const PlanTripPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("path");
  const [seed, setSeed] = useState<ChatDetails | null>(null);
  const [chatKey, setChatKey] = useState(0);

  const handleBack = () => {
    if (mode === "path") navigate(-1);
    else setMode("path");
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={handleBack} className="p-1 -ml-1 active:scale-90 transition-transform">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground flex-1">
            {mode === "guided" ? "Guided Planner" : "Trip Planner"}
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-nav">
        {mode === "path" && (
          <PathSelector
            onNewSpot={() => setMode("chat")}
            onPickSpot={(s) => {
              setPickedSpot(s);
              setMode("guided");
            }}
          />
        )}

        {mode === "chat" && (
          <PlannerChat
            key={chatKey}
            seedDetails={seed}
            onSwitchToGuided={() => setMode("guided")}
            onSaved={() => navigate("/trips")}
          />
        )}

        {mode === "guided" && (
          <GuidedPlanner
            onSwitchToChat={(s) => {
              setSeed(s);
              setChatKey((k) => k + 1);
              setMode("chat");
            }}
            onSaved={() => navigate("/trips")}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default PlanTripPage;
