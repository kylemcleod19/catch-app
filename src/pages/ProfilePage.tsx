import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useHomeState } from "@/hooks/useHomeState";
import { US_STATES, getStateName } from "@/lib/us-states";
import { LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";

const ProfilePage = () => {
  const { user, isDemo, signOut } = useAuth();
  const { homeState, updateHomeState } = useHomeState();
  const displayName = user?.user_metadata?.display_name || "Angler";
  const initial = displayName.charAt(0).toUpperCase();

  const handleStateChange = async (value: string) => {
    await updateHomeState(value);
    toast.success(`Home state set to ${getStateName(value)}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold tracking-tight text-foreground">Profile</h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <div className="catch-card text-center space-y-3">
          <div className="h-16 w-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">{initial}</span>
          </div>
          <div>
            <p className="font-semibold text-card-foreground">{displayName}</p>
            {isDemo && (
              <span className="inline-block mt-1 text-[10px] font-medium uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                Demo Mode
              </span>
            )}
            {!isDemo && user?.email && (
              <p className="text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
        </div>

        {/* Home State */}
        <div className="catch-card space-y-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-card-foreground">Home State</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Sets your default state when adding new fishing spots.
          </p>
          <Select value={homeState ?? ""} onValueChange={handleStateChange}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Select your home state" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {US_STATES.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" />
          {isDemo ? "Exit Demo" : "Sign Out"}
        </Button>
      </main>
      <BottomNav />
    </div>
  );
};

export default ProfilePage;
