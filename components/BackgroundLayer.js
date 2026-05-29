export default function BackgroundLayer() {
  return (
    <>
      <div className="bg-orbs" aria-hidden="true">
        <div className="bg-orbs__orb bg-orbs__orb--1" />
        <div className="bg-orbs__orb bg-orbs__orb--2" />
        <div className="bg-orbs__orb bg-orbs__orb--3" />
      </div>
      <div className="bg-dot-grid" aria-hidden="true" />
    </>
  );
}
