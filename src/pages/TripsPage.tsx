import { Fish } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const TripsPage = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold tracking-tight text-foreground">My Trips</h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-12 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Fish className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-1">No trips yet</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Log your first fishing trip from the dashboard to start building your history.
        </p>
      </main>
      <BottomNav />
    </div>
  );
};

export default TripsPage;
