import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-surface">
      <div className="text-center max-w-md mx-auto px-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
          <span className="font-display text-4xl font-bold text-primary">404</span>
        </div>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mb-8 text-muted-foreground leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/">
          <Button className="gap-2 rounded-xl h-11">
            <ArrowLeft className="h-4 w-4" /> Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
