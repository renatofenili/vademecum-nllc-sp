import { useState, useEffect } from "react";
import Header, { TabType } from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Categories from "@/components/Categories";
import SearchSection from "@/components/SearchSection";
import NormasTab from "@/components/tabs/NormasTab";
import RelatoriosTab from "@/components/tabs/RelatoriosTab";
import ConsultasTab from "@/components/tabs/ConsultasTab";
import MapasTab from "@/components/tabs/MapasTab";
import MudancasTab from "@/components/tabs/MudancasTab";

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [initialSearch, setInitialSearch] = useState<string>("");

  const handleNavigate = (tab: TabType, searchTerm?: string) => {
    if (searchTerm) {
      setInitialSearch(searchTerm);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Reset initial search when tab changes
  useEffect(() => {
    if (activeTab !== "normas") {
      setInitialSearch("");
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
            <NormasTab initialSearch={initialSearch} />
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
            <ConsultasTab />
          </div>
        );
      case "mapas":
        return (
          <div className="container py-6 md:py-8">
            <MapasTab />
          </div>
        );
      case "mudancas":
        return (
          <div className="container py-6 md:py-8">
            <MudancasTab />
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
