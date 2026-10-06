import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeroSection } from '../components/landing/HeroSection';
import { FindParkingSection } from '../components/landing/FindParkingSection';
import { ParkingMapShowcase } from '../components/landing/ParkingMapShowcase';
import { BusinessSection } from '../components/landing/BusinessSection';
import { IntelligenceSection } from '../components/landing/IntelligenceSection';
import { DriverJourney } from '../components/landing/DriverJourney';
import { TrustSection } from '../components/landing/TrustSection';
import { FinalCTA } from '../components/landing/FinalCTA';
import { LandingFooter } from '../components/landing/LandingFooter';
import { AuthModal } from '../components/shared/AuthModal/AuthModal';
import '../components/landing/landing.css';

export function LandingPage({ activeUser, setActiveUser }) {
  const navigate = useNavigate();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authRole, setAuthRole] = useState('driver');

  const handleOpenAuth = (role) => {
    if (role === 'driver' || role === 'operator') {
      navigate(`/login/${role}`);
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="landing-page-root">
      <main className="landing-main-content">
        {/* 1. Large Editorial Hero with Integrated Top Navigation */}
        <HeroSection onOpenAuth={handleOpenAuth} />

        {/* 2. Find Parking Easily (Interactive Discovery & Real-Time Search) */}
        <FindParkingSection />

        {/* 3. Interactive Parking Map Experience (Using actual ParkingMap.jsx) */}
        <ParkingMapShowcase />

        {/* 4. For Businesses & Facility Operators */}
        <BusinessSection />

        {/* 5. ParkSpot Intelligence (Predictive Operations & Outlook) */}
        <IntelligenceSection />

        {/* 6. How It Works (4-Step Flow: Find, Choose, Reserve, Park) */}
        <DriverJourney />

        {/* 7. Trust & Product Principles */}
        <TrustSection />

        {/* 8. Final Call to Action */}
        <FinalCTA />
      </main>

      {/* 9. Minimal Editorial Footer */}
      <LandingFooter />

      {/* Driver / Operator Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultRole={authRole}
        onAuthSuccess={(user) => {
          const effectiveAccountType = user?.accountType || (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(user?.role) ? 'OPERATOR' : 'DRIVER');
          if (effectiveAccountType === 'OPERATOR') {
            navigate('/operator');
          } else {
            navigate('/driver');
          }
        }}
      />
    </div>
  );
}

export default LandingPage;
