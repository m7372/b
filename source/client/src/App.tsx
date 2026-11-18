import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";

function AppRoutes() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return <WouterRouter base={basePath || undefined}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  </WouterRouter>;
}

export default function App() {
  return <ErrorBoundary><TooltipProvider><Toaster /><AppRoutes /></TooltipProvider></ErrorBoundary>;
}
