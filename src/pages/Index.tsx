import { useState } from "react";
import Header, { TabType } from "@/components/Header";
import Footer from "@/components/Footer";
import NormasTab from "@/components/tabs/NormasTab";
import RelatoriosTab from "@/components/tabs/RelatoriosTab";
import ConsultasTab from "@/components/tabs/ConsultasTab";
import MapasTab from "@/components/tabs/MapasTab";
import MudancasTab from "@/components/tabs/MudancasTab";

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>("normas");

  const renderTab = () => {
    switch (activeTab) {
      case "normas":
        return <NormasTab />;
      case "relatorios":
        return <RelatoriosTab />;
      case "consultas":
        return <ConsultasTab />;
      case "mapas":
        return <MapasTab />;
      case "mudancas":
        return <MudancasTab />;
      default:
        return <NormasTab />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 container py-6 md:py-8">
        {renderTab()}
      </main>
      <Footer onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
