import React from 'react';

const PRINCIPLES = [
  {
    number: '01',
    title: "Know where you'll park.",
    desc: 'No circling city blocks or entering full facilities. Discover verified capacity before you set off.'
  },
  {
    number: '02',
    title: 'Choose the space that works for you.',
    desc: 'Inspect exact driving lanes, bay numbers, EV fast-chargers, and accessible spots on a live floor layout.'
  },
  {
    number: '03',
    title: 'Reserve before you arrive.',
    desc: 'Lock in your parking bay with a temporary hold and check in seamlessly with a contactless digital pass.'
  },
  {
    number: '04',
    title: 'Give operators better visibility.',
    desc: 'Equip management teams with clear real-time parking-state information, demand foresight, and calibrated pricing.'
  }
];

export function TrustSection() {
  return (
    <section className="editorial-principles-section" id="principles">
      <div className="editorial-principles-container">
        {/* Large Rounded Photography-Backed Panel */}
        <div className="principles-photo-panel">
          {/* Subtle Dark Directional Overlay to keep garage photography visible */}
          <div className="principles-photo-overlay" />

          {/* Section Header & Content */}
          <div className="principles-content-wrap">
            <header className="principles-header text-center">
              <span className="principles-eyebrow">OUR PRINCIPLES</span>
              <h2 className="principles-main-heading">
                Built around how mobility should feel.
              </h2>
              <p className="principles-subheading">
                ParkSpot is guided by simple product principles that prioritize certainty for drivers and visibility for operators.
              </p>
            </header>

            {/* Four Frosted Translucent Cards */}
            <div className="principles-cards-grid">
              {PRINCIPLES.map((item) => (
                <article key={item.number} className="frosted-principle-card">
                  <div className="frosted-card-number">{item.number}</div>
                  <h3 className="frosted-card-title">{item.title}</h3>
                  <p className="frosted-card-desc">{item.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default TrustSection;
