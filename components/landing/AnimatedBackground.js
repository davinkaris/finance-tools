export default function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="vale-orb vale-orb-1 absolute -left-32 top-0 h-[600px] w-[600px] rounded-full bg-[#10b981] opacity-[0.15] blur-[120px]" />
      <div className="vale-orb vale-orb-2 absolute -right-32 bottom-0 h-[500px] w-[500px] rounded-full bg-[#0d9488] opacity-10 blur-[150px]" />
      <div className="vale-orb vale-orb-3 absolute right-[10%] top-1/2 h-[400px] w-[400px] rounded-full bg-[#10b981] opacity-[0.08] blur-[100px]" />
      <div className="vale-grid absolute inset-0" aria-hidden="true" />
      <div className="vale-noise absolute inset-0" aria-hidden="true" />
    </div>
  );
}
