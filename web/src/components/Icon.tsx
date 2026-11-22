import styles from "./Icon.module.css";

/**
 * 오름님 시안(11.22 studio night layout)의 아이콘 52개. 24×24, 선 1.65px, 둥근 끝.
 * 장식용이라 aria-hidden이에요. 뜻은 버튼의 글자나 aria-label이 전해요.
 */
const PATHS = {
  "chevron": "<path d=\"m9 5 7 7-7 7\"/>",
  "down": "<path d=\"m6 9 6 6 6-6\"/>",
  "plus": "<path d=\"M12 5v14M5 12h14\"/>",
  "close": "<path d=\"m6 6 12 12M6 18 18 6\"/>",
  "left": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M9 4v16\"/>",
  "right": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M15 4v16\"/>",
  "doc": "<path d=\"M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6\"/>",
  "folder": "<path d=\"M3 7V4h7l2 3h9v13H3z\"/>",
  "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 5 5\"/>",
  "edit": "<path d=\"m4 15 11-11 5 5L9 20l-6 1zM12 7l5 5M4 15l5 5\"/>",
  "layout": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M10 9v12M14 13h3M14 16h3\"/>",
  "spark": "<path d=\"m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4M18 4h4\"/>",
  "undo": "<path d=\"M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7\"/>",
  "redo": "<path d=\"m16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7\"/>",
  "bold": "<path d=\"M6 4h7a4 4 0 0 1 0 8H6zm0 8h8a4 4 0 0 1 0 8H6z\"/>",
  "italic": "<path d=\"M11 4h8M5 20h8M15 4 9 20\"/>",
  "underline": "<path d=\"M6 3v8a6 6 0 0 0 12 0V3M4 21h16\"/>",
  "strike": "<path d=\"M17 5c-3-3-10-2-10 2 0 2 2 3 5 4M7 18c3 3 10 2 10-2 0-2-2-3-5-4M3 12h18\"/>",
  "align-left": "<path d=\"M4 5h16M4 10h10M4 15h16M4 20h10\"/>",
  "align-center": "<path d=\"M3 5h18M7 10h10M3 15h18M7 20h10\"/>",
  "align-justify": "<path d=\"M4 5h16M4 10h16M4 15h16M4 20h16\"/>",
  "list": "<path d=\"M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01\"/>",
  "image": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8\" cy=\"8\" r=\"1.5\"/><path d=\"m21 16-6-6-9 11\"/>",
  "grid": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"1\"/><path d=\"M3 9h18M3 15h18M9 3v18M15 3v18\"/>",
  "link": "<path d=\"m10 13 4-4m-6 8-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1\" transform=\"translate(1 1) scale(.9)\"/>",
  "comment": "<path d=\"M3 4h18v13H8l-5 4zM7 8h10M7 12h7\"/>",
  "settings": "<path d=\"M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6\"/>",
  "check": "<path d=\"m4 12 5 5L20 6\"/>",
  "arrow": "<path d=\"M12 20V4m-6 6 6-6 6 6\"/>",
  "download": "<path d=\"M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5\"/>",
  "upload": "<path d=\"M12 17V3m-5 5 5-5 5 5M4 16v5h16v-5\"/>",
  "more": "<circle cx=\"5\" cy=\"12\" r=\".8\"/><circle cx=\"12\" cy=\"12\" r=\".8\"/><circle cx=\"19\" cy=\"12\" r=\".8\"/>",
  "type": "<path d=\"M4 6V3h16v3M12 3v18M8 21h8\"/>",
  "ruler": "<path d=\"m3 16 13-13 5 5L8 21zM7 12l2 2m2-6 2 2m2-6 2 2\"/>",
  "crop": "<path d=\"M7 3v14h14M3 7h14v14\"/>",
  "pointer": "<path d=\"m4 3 5 17 4-7 7-4z\"/>",
  "book": "<path d=\"M12 6c-3-3-6-3-10-2v16c4-1 7-1 10 2 3-3 6-3 10-2V4c-4-1-7-1-10 2zm0 0v16\"/>",
  "focus": "<path d=\"M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5\"/>",
  "history": "<path d=\"M3 3v6h6M3 9a9 9 0 1 1 1 9m8-12v6l4 2\"/>",
  "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6m0-10h.01\"/>",
  "trash": "<path d=\"M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7\"/>",
  "columns": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"1\"/><path d=\"M12 4v16\"/>",
  "number-list": "<path d=\"M10 6h11M10 12h11M10 18h11M3 3h2v6M3 9h4M3 15c0-3 4-3 4 0 0 2-4 2-4 5h4\"/>",
  "indent": "<path d=\"M3 4h18M11 9h10M11 15h10M3 20h18M3 8l4 4-4 4\"/>",
  "outdent": "<path d=\"M3 4h18M11 9h10M11 15h10M3 20h18m4-12-4 4 4 4\"/>",
  "leading": "<path d=\"M11 5h10M11 12h10M11 19h10M4 4v16M1 7l3-3 3 3m-6 10 3 3 3-3\"/>",
  "eraser": "<path d=\"m14 3 7 7-10 11H6l-4-5zM7 11l7 7M11 21h10\"/>",
  "note": "<path d=\"M4 3h16v18H4zM8 7h8M8 11h8M8 15h4M16 15v3\"/>",
  "align-right": "<path d=\"M4 5h16M10 10h10M4 15h16M10 20h10\"/>",
  "quote": "<path d=\"M4 5h6v7H5c0 4 1 5 4 6M14 5h6v7h-5c0 4 1 5 4 6\"/>",
  "track": "<path d=\"M3 5h10M3 10h8M3 15h6m3 1 6-6 3 3-6 6-4 1zM16 5h5\"/>",
  "minimize": "<path d=\"M5 16h14\"/>",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = "md", className }: { name: IconName; size?: "xs" | "sm" | "md"; className?: string }) {
  return (
    <svg
      className={className ? `${styles.icon} ${className}` : styles.icon}
      data-size={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
