import type React from "react";
import { useEffect, useRef, useState } from "react";

import { kanjiToSvgPath } from "../../utils/kanji";

type KanjiStrokeViewerProps = {
  kanji: string;
  showNumbers?: boolean;
  animate?: boolean;
  size?: number;
  className?: string;
};

export function KanjiStrokeViewer({
  kanji,
  showNumbers = false,
  animate = false,
  size = 200,
  className = "",
}: KanjiStrokeViewerProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimeoutRef = useRef<number | null>(null);
  const strokePathsRef = useRef<SVGPathElement[]>([]);
  const startAnimationRef = useRef<(() => void) | null>(null);

  // Charger le SVG
  useEffect(() => {
    if (!kanji) {
      setIsLoading(false);
      setError("Aucun kanji fourni");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSvgContent(null);
    setIsAnimating(false);
    strokePathsRef.current = [];

    const svgPath = kanjiToSvgPath(kanji);
    if (!svgPath) {
      setIsLoading(false);
      setError("Kanji invalide");
      return;
    }

    fetch(svgPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error("SVG non trouvé");
        }
        return response.text();
      })
      .then((text) => {
        // Nettoyer le SVG : supprimer les caractères bizarres qui pourraient apparaître
        let modifiedSvg = text.replace(/\]>/g, "");

        // Masquer les numéros KanjiVG par défaut et ajuster le SVG
        // Remplacer les numéros par des versions stylisées (cercle rouge + texte blanc)
        modifiedSvg = modifiedSvg.replace(
          /<g id="kvg:StrokeNumbers[^"]*"[^>]*>/g,
          '<g id="kvg:StrokeNumbers" style="display:none;">',
        );

        // Remplacer les éléments text des numéros pour les styliser (plus petits, blancs dans cercle rouge)
        // Les numéros seront positionnés au début de chaque trait pour une meilleure lisibilité
        modifiedSvg = modifiedSvg.replace(/<text([^>]*)>(\d+)<\/text>/g, (match, attrs, num) => {
          // Extraire la transformation
          const transformMatch = attrs.match(/transform="([^"]*)"/);
          const transform = transformMatch ? transformMatch[1] : "";

          // Extraire les coordonnées de la transformation matrix
          let x = 0;
          let y = 0;
          if (transform.includes("matrix")) {
            const matrixMatch = transform.match(
              /matrix\([^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^,]+),\s*([^)]+)\)/,
            );
            if (matrixMatch) {
              x = Number.parseFloat(matrixMatch[1]);
              y = Number.parseFloat(matrixMatch[2]);
            }
          }

          // Utiliser la couleur primaire directement (rouge vermillon) car les variables CSS ne fonctionnent pas dans SVG
          // Numéros plus petits (rayon 4.5px, texte 4.5px) pour une meilleure lisibilité et ne pas masquer les traits
          // Ajouter une bordure blanche fine pour mieux voir le numéro
          return `<g transform="${transform}">
              <circle cx="${x}" cy="${y}" r="4.5" fill="#c73e1d" opacity="0.95" stroke="#ffffff" stroke-width="0.3"/>
              <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="4.5" font-weight="700">${num}</text>
            </g>`;
        });

        // S'assurer que le SVG a une taille appropriée
        modifiedSvg = modifiedSvg.replace(/<svg([^>]*)>/, (match, attrs) => {
          // Extraire le viewBox si présent
          const viewBoxMatch = attrs.match(/viewBox="([^"]*)"/);
          let svgAttrs = attrs;

          // Si pas de viewBox, en ajouter un par défaut
          if (!viewBoxMatch) {
            svgAttrs += ' viewBox="0 0 109 109"';
          }

          // Forcer la taille
          svgAttrs = svgAttrs.replace(/width="[^"]*"/, `width="${size}"`);
          svgAttrs = svgAttrs.replace(/height="[^"]*"/, `height="${size}"`);

          if (!svgAttrs.includes("width=")) {
            svgAttrs += ` width="${size}"`;
          }
          if (!svgAttrs.includes("height=")) {
            svgAttrs += ` height="${size}"`;
          }

          return `<svg${svgAttrs}>`;
        });

        setSvgContent(modifiedSvg);
        setIsLoading(false);
      })
      .catch(() => {
        setError("SVG non disponible pour ce kanji");
        setIsLoading(false);
      });
  }, [kanji, size]);

  // Extraire les paths après le rendu du SVG
  useEffect(() => {
    if (!svgRef.current || !svgContent) {
      return;
    }

    const svgElement = svgRef.current.querySelector("svg");
    if (!svgElement) {
      return;
    }

    // Trouver tous les paths de traits dans le groupe StrokePaths
    const strokePathsGroup = svgElement.querySelector('g[id^="kvg:StrokePaths"]');
    if (strokePathsGroup) {
      const paths = Array.from(strokePathsGroup.querySelectorAll("path")) as SVGPathElement[];
      strokePathsRef.current = paths;
    } else {
      // Fallback : tous les paths
      const paths = Array.from(svgElement.querySelectorAll("path")) as SVGPathElement[];
      strokePathsRef.current = paths;
    }
  }, [svgContent]);

  // Gérer l'affichage des numéros KanjiVG
  useEffect(() => {
    if (!svgRef.current || !svgContent) {
      return;
    }

    const svgElement = svgRef.current.querySelector("svg");
    if (!svgElement) {
      return;
    }

    const strokeNumbersGroup = svgElement.querySelector('g[id^="kvg:StrokeNumbers"]');
    if (strokeNumbersGroup) {
      if (showNumbers) {
        strokeNumbersGroup.setAttribute("style", "display:block;");
        strokeNumbersGroup.setAttribute("display", "block");
      } else {
        strokeNumbersGroup.setAttribute("style", "display:none;");
      }
    }
  }, [svgContent, showNumbers]);

  // Fonction pour démarrer l'animation
  const createStartAnimation = () => {
    return () => {
      // Nettoyer l'animation précédente
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }

      if (!svgRef.current) {
        return;
      }

      setIsAnimating(true);

      const strokePaths = strokePathsRef.current;

      if (strokePaths.length === 0) {
        setIsAnimating(false);
        return;
      }

      // Réinitialiser tous les paths
      for (const path of strokePaths) {
        const length = path.getTotalLength();
        if (length > 0) {
          path.style.strokeDasharray = `${length}`;
          path.style.strokeDashoffset = `${length}`;
          path.style.opacity = "0";
          path.style.transition = "none";
        }
      }

      let currentIndex = 0;

      function animateNextStroke() {
        if (currentIndex >= strokePaths.length) {
          setIsAnimating(false);
          return;
        }

        const path = strokePaths[currentIndex];
        const length = path.getTotalLength();

        if (length > 0) {
          // Afficher le path avec transition
          path.style.opacity = "1";
          path.style.transition = "stroke-dashoffset 0.6s ease-in-out, opacity 0.1s ease-in-out";

          // Animer le tracé
          requestAnimationFrame(() => {
            path.style.strokeDashoffset = "0";
          });
        }

        currentIndex++;
        if (currentIndex < strokePaths.length) {
          animationTimeoutRef.current = window.setTimeout(animateNextStroke, 700);
        } else {
          setIsAnimating(false);
        }
      }

      // Démarrer l'animation après un court délai pour s'assurer que le SVG est rendu
      animationTimeoutRef.current = window.setTimeout(animateNextStroke, 200);
    };
  };

  // Animation séquentielle
  useEffect(() => {
    if (!animate || !svgRef.current || !svgContent) {
      // Réinitialiser si l'animation est désactivée
      if (!animate && svgRef.current) {
        const svgElement = svgRef.current.querySelector("svg");
        if (svgElement) {
          for (const path of strokePathsRef.current) {
            path.style.strokeDasharray = "";
            path.style.strokeDashoffset = "";
            path.style.opacity = "1";
            path.style.transition = "";
          }
        }
      }
      startAnimationRef.current = null;
      return;
    }

    // Créer et stocker la fonction de démarrage
    const startFn = createStartAnimation();
    startAnimationRef.current = startFn;

    // Démarrer l'animation
    startFn();

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
    };
  }, [animate, svgContent]);

  // Arrêter l'animation
  const handleStopAnimation = () => {
    // Arrêter l'animation en cours
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }

    setIsAnimating(false);
    // Laisser les traits déjà animés visibles, juste arrêter l'animation en cours
  };

  // Réinitialiser et redémarrer l'animation
  const handleResetAnimation = () => {
    // Arrêter l'animation en cours
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }

    setIsAnimating(false);

    // Réinitialiser tous les paths
    if (svgRef.current) {
      const strokePaths = strokePathsRef.current;
      for (const path of strokePaths) {
        const length = path.getTotalLength();
        if (length > 0) {
          path.style.strokeDasharray = `${length}`;
          path.style.strokeDashoffset = `${length}`;
          path.style.opacity = "0";
          path.style.transition = "none";
        }
      }
    }

    // Redémarrer l'animation en utilisant la fonction stockée
    if (startAnimationRef.current) {
      setTimeout(() => {
        startAnimationRef.current?.();
      }, 100);
    }
  };

  if (isLoading) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-muted)",
        }}
      >
        Chargement...
      </div>
    );
  }

  if (error || !svgContent) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-muted)",
          fontSize: "14px",
        }}
      >
        <div
          style={{
            fontSize: `${size * 0.6}px`,
            marginBottom: "8px",
            fontWeight: 700,
            color: "var(--color-text)",
          }}
        >
          {kanji}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7, textAlign: "center", maxWidth: "200px" }}>
          SVG non disponible
          <br />
          <span style={{ fontSize: "10px" }}>
            (Ajoutez le fichier {kanjiToSvgPath(kanji).replace("/kanji/", "")} dans /public/kanji/)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={svgRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      {animate && (
        <div
          style={{
            position: "absolute",
            bottom: "-40px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "var(--space-2)",
          }}
        >
          {isAnimating ? (
            <button
              type="button"
              className="button"
              onClick={handleStopAnimation}
              style={{
                fontSize: "12px",
                padding: "6px 12px",
              }}
            >
              Arrêter
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={handleResetAnimation}
              style={{
                fontSize: "12px",
                padding: "6px 12px",
              }}
            >
              Rejouer l'animation
            </button>
          )}
        </div>
      )}
    </div>
  );
}
