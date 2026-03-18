import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import WeatherHeader from "@/components/WeatherHeader";
import RecentCatches from "@/components/RecentCatchCard";

const Index = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">CATCH</h1>
            <p className="text-xs text-muted-foreground tracking-wide">Fishing Log</p>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <span className="sr-only">Notifications</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        <WeatherHeader />

        {/* Quick Log CTA */}
        <Button variant="catch" size="lg" className="w-full gap-2">
          <Plus className="w-5 h-5" />
          Log Catch
        </Button>

        <RecentCatches />
      </main>

      <BottomNav />
    </div>
  );
};

export default Index;
