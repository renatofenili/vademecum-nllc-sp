import { useState, useEffect } from "react";
import Header, { TabType } from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Categories from "@/components/Categories";
import SearchSection from "@/components/SearchSection";
import NormasTab from "@/components/tabs/NormasTab";
import RelatoriosTab from "@/components/tabs/RelatoriosTab";
import ConsultasTab from "@/components/tabs/ConsultasTab";
import JurisprudenciaTab from "@/components/tabs/JurisprudenciaTab";
import MapasTab from "@/components/tabs/MapasTab";
import MapaCalorTab from "@/components/tabs/MapaCalorTab";
import FerramentasTab from "@/components/tabs/FerramentasTab";

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [initialSearch, setInitialSearch] = useState<string>("");
  const [selectedNormaId, setSelectedNormaId] = useState<string | null>(null);

  const handleNavigate = (tab: TabType, searchTerm?: string) => {
    if (searchTerm) {
      setInitialSearch(searchTerm);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNavigateToNorma = (normaId: string) => {
    setSelectedNormaId(normaId);
    setActiveTab("normas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Reset states when tab changes
  useEffect(() => {
    if (activeTab !== "normas") {
      setInitialSearch("");
      setSelectedNormaId(null);
    }
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return (
          <>
            <Hero onNavigate={handleNavigate} />
            <Categories onNavigate={handleNavigate} />
            <SearchSection onNavigate={handleNavigate} />
          </>
        );
      case "normas":
        return (
          <div className="container py-6 md:py-8">
            <NormasTab initialSearch={initialSearch} selectedNormaId={selectedNormaId} />
          </div>
        );
      case "relatorios":
        return (
          <div className="container py-6 md:py-8">
            <RelatoriosTab />
          </div>
        );
      case "consultas":
        return (
          <div className="container py-6 md:py-8">
            <ConsultasTab onNavigateToNorma={handleNavigateToNorma} />
          </div>
        );
      case "jurisprudencia":
        return (
          <div className="container py-6 md:py-8">
            <JurisprudenciaTab />
          </div>
        );
      case "mapas":
        return (
          <div className="container py-6 md:py-8">
            <MapasTab />
          </div>
        );
      case "mapacalor":
        return (
          <div className="container py-6 md:py-8">
            <MapaCalorTab />
          </div>
        );
      case "ferramentas":
        return (
          <div className="container py-6 md:py-8">
            <FerramentasTab />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1">
        {renderContent()}
      </main>
      <Footer onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
