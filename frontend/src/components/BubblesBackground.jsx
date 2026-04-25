import { useRef, useEffect } from 'react';

export default function BubblesBackground() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const createBubble = () => {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      const size = Math.random() * 25 + 8;
      const left = Math.random() * 100;
      const duration = Math.random() * 15 + 15;
      const delay = Math.random() * 8;
      bubble.style.cssText = `width:${size}px;height:${size}px;left:${left}%;animation-duration:${duration}s;animation-delay:${delay}s`;
      return bubble;
    };

    for (let i = 0; i < 20; i++) {
      container.appendChild(createBubble());
    }

    const interval = setInterval(() => {
      if (container.children.length < 25) {
        container.appendChild(createBubble());
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return <div className="bubbles-container" ref={containerRef} />;
}
