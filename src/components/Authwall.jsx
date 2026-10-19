import { useEffect, useState } from "react";
import DriftWall from "./DriftWall.jsx";

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * DriftWall with settings tuned per device.
 * Desktop: big tilted wall beside the form.
 * Phone: compact, gentler wall used as a header band (decorative, no hover/lift).
 */
export default function AuthWall({ items }) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const props = isMobile
    ? {
        columns: 6,
        tileWidth: 104,
        tileHeight: 70,
        gap: 10,
        radius: 10,
        speed: 24,
        tilt: 8,
        turn: -6,
        depth: 40,
        perspective: 900,
        parallax: 0,
        lift: 0,
        dim: 0.7,
        pauseOnHover: false,
      }
    : {
        columns: 4,
        tileWidth: 180,
        tileHeight: 120,
        gap: 16,
        radius: 14,
        speed: 36,
        pauseOnHover: true,
      };

  return (
    <DriftWall
      items={items && items.length > 0 ? items : undefined}
      direction="up"
      overlayColor="#0a0a0c"
      {...props}
    />
  );
}