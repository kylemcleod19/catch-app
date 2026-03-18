import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";

const ProfilePage = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold tracking-tight text-foreground">Profile</h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <div className="catch-card text-center space-y-3">
          <div className="h-16 w-16 rounded-full bg-secondary/20 mx-auto flex items-center justify-center">
            <span className="text-2xl font-bold text-secondary-foreground">K</span>
          </div>
          <div>
            <p className="font-semibold text-card-foreground">Demo Angler</p>
            <p className="text-xs text-muted-foreground">demo mode</p>
          </div>
        </div>
        <Button variant="outline" className="w-full">Sign In with Email</Button>
        <Button variant="catch" className="w-full">Try Demo Mode</Button>
      </main>
      <BottomNav />
    </div>
  );
};

export default ProfilePage;
