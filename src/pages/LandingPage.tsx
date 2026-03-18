import { useNavigate } from "react-router-dom";
import { Fish, ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

const LandingPage = () => {
  const navigate = useNavigate();
  const { startDemo } = useAuth();
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemo = async () => {
    setDemoLoading(true);
    try {
      await startDemo();
    } catch {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Fish className="w-10 h-10 text-primary" strokeWidth={2} />
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
          CATCH
        </h1>
        <p className="text-muted-foreground text-lg mb-1">
          Your fishing log, smarter.
        </p>
        <p className="text-muted-foreground text-sm max-w-xs mb-10">
          Log trips, track conditions, and get AI-powered recommendations to catch more fish.
        </p>

        <div className="w-full max-w-xs space-y-3">
          <Button
            variant="catch"
            size="lg"
            className="w-full gap-2"
            onClick={() => navigate("/signin")}
          >
            Sign In
            <ArrowRight className="w-5 h-5" />
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="w-full gap-2"
            onClick={handleDemo}
            disabled={demoLoading}
          >
            <Zap className="w-5 h-5" />
            {demoLoading ? "Starting Demo..." : "Try Demo"}
          </Button>
        </div>
      </div>

      {/* Features strip */}
      <div className="px-6 pb-10">
        <div className="max-w-xs mx-auto grid grid-cols-3 gap-4 text-center">
          {[
            { label: "Log Catches", icon: "🎣" },
            { label: "Track Weather", icon: "🌦️" },
            { label: "AI Tips", icon: "🤖" },
          ].map((f) => (
            <div key={f.label} className="catch-card flex flex-col items-center gap-1 py-3">
              <span className="text-2xl">{f.icon}</span>
              <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
