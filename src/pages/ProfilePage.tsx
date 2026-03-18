import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

const ProfilePage = () => {
  const { user, isDemo, signOut } = useAuth();
  const displayName = user?.user_metadata?.display_name || "Angler";
  const initial = displayName.charAt(0).toUpperCase();

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
