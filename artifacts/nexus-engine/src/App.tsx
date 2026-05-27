import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";

import Home from "@/pages/Home";
import NewRun from "@/pages/NewRun";
import Game from "@/pages/Game";
import Profile from "@/pages/Profile";
import Editor from "@/pages/Editor";
import WorldBuilder from "@/pages/WorldBuilder";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

function AnimatedRoutes() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="flex-1 flex flex-col min-h-0"
      >
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/new-run" component={NewRun} />
          <Route path="/game/:runId" component={Game} />
          <Route path="/profile" component={Profile} />
          <Route path="/editor/:runId" component={Editor} />
          <Route path="/world-builder" component={WorldBuilder} />
          <Route path="/world-builder/:worldId" component={WorldBuilder} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="flex flex-col min-h-screen bg-background text-foreground">
            <AnimatedRoutes />
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
