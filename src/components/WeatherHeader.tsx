import { Cloud, Droplets, Wind } from "lucide-react";

const WeatherHeader = () => {
  return (
    <div className="catch-card flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
          <Cloud className="w-5 h-5 text-secondary-foreground" />
        </div>
        <div>
          <p className="catch-label">Current Conditions</p>
          <p className="text-lg font-medium tracking-tight text-card-foreground">72°F · Partly Cloudy</p>
        </div>
      </div>
      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-0.5">
          <Wind className="w-4 h-4 text-muted-foreground" />
          <span className="catch-data text-xs text-muted-foreground">12mph</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Droplets className="w-4 h-4 text-muted-foreground" />
          <span className="catch-data text-xs text-muted-foreground">45%</span>
        </div>
      </div>
    </div>
  );
};

export default WeatherHeader;
