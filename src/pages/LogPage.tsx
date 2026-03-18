import BottomNav from "@/components/BottomNav";

const LogPage = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold tracking-tight text-foreground">Fishing Log</h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-6">
        <p className="text-muted-foreground text-sm">Your full trip history will appear here.</p>
      </main>
      <BottomNav />
    </div>
  );
};

export default LogPage;
