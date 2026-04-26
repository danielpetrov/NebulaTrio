import { useRef, useEffect } from 'react';

export default function BubblesBackground({ visible = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const createBubble = () => {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      const size     = Math.random() * 20 + 6;   // 6–26px (subtler than before)
      const left     = Math.random() * 100;
      const duration = Math.random() * 15 + 15;   // 15–30s
      const delay    = Math.random() * 8;
      bubble.style.cssText = `width:${size}px;height:${size}px;left:${left}%;animation-duration:${duration}s;animation-delay:${delay}s`;
      return bubble;
    };

    for (let i = 0; i < 18; i++) {
      container.appendChild(createBubble());
    }

    const interval = setInterval(() => {
      if (container.children.length < 22) {
        container.appendChild(createBubble());
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`bubbles-container${visible ? ' bubbles-visible' : ''}`}
      ref={containerRef}
    />
  );
}
