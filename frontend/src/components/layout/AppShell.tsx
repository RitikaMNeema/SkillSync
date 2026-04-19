import { Outlet } from "react-router-dom";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { PageWrapper } from "./PageWrapper";

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <PageWrapper className="pb-20 md:pb-6">
        <Outlet />
        <Footer />
      </PageWrapper>
    </div>
  );
}
