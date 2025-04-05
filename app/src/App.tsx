import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Layout from "./components/Layout";
import Marketplace from "./pages/Marketplace";
import MyProperties from "./pages/MyProperties";
import MyOffers from "./pages/MyOffers";
import Transactions from "./pages/Transactions";
import { WalletContextProvider } from "./context/WalletContext";
import { PropertyProvider } from "./context/PropertyContext";
import { AuthProvider } from "./contexts/AuthContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Marketplace} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/my-properties" component={MyProperties} />
      <Route path="/my-offers" component={MyOffers} />
      <Route path="/transactions" component={Transactions} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WalletContextProvider>
          <PropertyProvider>
            <Layout>
              <Router />
            </Layout>
            <Toaster />
          </PropertyProvider>
        </WalletContextProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
