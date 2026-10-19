// Generated from docs/navigation-1.4.0/graphics/{manoeuvres,map,entry}/*.svg
// (graphics designer, GRAPHICS.md). Do not edit by hand: re-run the converter
// on the SVGs instead. Single-colour glyphs use currentColor (the color prop).

export interface SvgNode {
  t: "path" | "circle" | "rect" | "g" | "mask" | "defs" | "line" | "polyline" | "polygon" | "ellipse";
  p: Record<string, string>;
  c?: SvgNode[];
}

export interface SvgGlyph {
  viewBox: string;
  nodes: SvgNode[];
}

export const MANOEUVRE_GLYPHS: Record<string, SvgGlyph> = {
  "arrive": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "fill": "currentColor",
          "fillRule": "evenodd",
          "d": "M24 45 L12.2 26.5 A14 14 0 1 1 35.8 26.5 Z M24 13 A6 6 0 1 0 24 25 A6 6 0 1 0 24 13 Z"
        }
      }
    ]
  },
  "continue": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M24 44 L24 16.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 5 L32 18 L16 18 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "depart": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "24",
          "cy": "38",
          "r": "6",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 31.5 L24 16.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 5 L32 18 L16 18 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "keep-left": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "g",
        "p": {
          "transform": "matrix(-1 0 0 1 48 0)"
        },
        "c": [
          {
            "t": "path",
            "p": {
              "d": "M24 30 L19.2 25.2 Q15 21 15 15 L15 8",
              "fill": "none",
              "stroke": "currentColor",
              "strokeWidth": "4",
              "strokeLinecap": "round",
              "strokeLinejoin": "round",
              "strokeOpacity": ".3"
            }
          },
          {
            "t": "path",
            "p": {
              "d": "M24 45 L24 36 Q24 30 28.2 25.8 L28.8 25.2 Q33 21 33 15 L33 16.5",
              "fill": "none",
              "stroke": "currentColor",
              "strokeWidth": "5",
              "strokeLinecap": "round",
              "strokeLinejoin": "round"
            }
          },
          {
            "t": "path",
            "p": {
              "d": "M33 5 L41 18 L25 18 Z",
              "fill": "currentColor"
            }
          }
        ]
      }
    ]
  },
  "keep-right": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M24 30 L19.2 25.2 Q15 21 15 15 L15 8",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 45 L24 36 Q24 30 28.2 25.8 L28.8 25.2 Q33 21 33 15 L33 16.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M33 5 L41 18 L25 18 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "motorway-exit-left": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M31 30 V5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M31 45 L31 38 Q31 31 26.1 26.1 L21.9 21.9 Q17 17 17 10 L17 16.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M17 5 L25 18 L9 18 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "roundabout-exit-1": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "24",
          "cy": "22.5",
          "r": "8.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 12.5 L24 3.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M34 22.5 L43 22.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 46 L24 31 A8.5 8.5 0 0 1 15.5 22.5 L11 22.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M2.5 22.5 L12.5 16 L12.5 29 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "roundabout-exit-2": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "24",
          "cy": "22.5",
          "r": "8.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M14 22.5 L5 22.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M34 22.5 L43 22.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 46 L24 31 A8.5 8.5 0 0 1 24 14 L24 9.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 1 L30.5 11 L17.5 11 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "roundabout-exit-3": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "24",
          "cy": "22.5",
          "r": "8.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M14 22.5 L5 22.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 12.5 L24 3.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 46 L24 31 A8.5 8.5 0 1 1 32.5 22.5 L37 22.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M45.5 22.5 L35.5 29 L35.5 16 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "roundabout-exit-4": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "24",
          "cy": "22.5",
          "r": "8.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M14.5 25.6 L5.9 28.4",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M18.1 14.4 L12.8 7.1",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M29.9 14.4 L35.2 7.1",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 46 L24 31 A8.5 8.5 0 1 1 32.1 25.1 L36.4 26.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M44.4 29.1 L32.9 32.2 L36.9 19.9 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "roundabout-exit-5": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "24",
          "cy": "22.5",
          "r": "8.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M15.3 27.5 L7.5 32",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M15.3 17.5 L7.5 13",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 12.5 L24 3.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M32.7 17.5 L40.5 13",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 46 L24 31 A8.5 8.5 0 1 1 31.4 26.8 L35.3 29",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M42.6 33.2 L30.7 33.9 L37.2 22.6 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "roundabout-exit-6": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "24",
          "cy": "22.5",
          "r": "8.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M16.2 28.7 L9.1 34.3",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M14.3 20.3 L5.5 18.3",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M19.7 13.5 L15.8 5.4",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M28.3 13.5 L32.2 5.4",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M33.7 20.3 L42.5 18.3",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "3.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 46 L24 31 A8.5 8.5 0 1 1 30.6 27.8 L34.2 30.6",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M40.8 35.9 L28.9 34.8 L37 24.6 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "roundabout": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M24 46 L24 36",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "4",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeOpacity": ".3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M18.4 30.6 A12 12 0 1 1 35.7 22.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M33.7 32.3 L28.6 20 L43.3 23.1 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "sharp-left": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "g",
        "p": {
          "transform": "matrix(-1 0 0 1 48 0)"
        },
        "c": [
          {
            "t": "path",
            "p": {
              "d": "M15 44 L15 14 Q15 9 18.5 12.5 L31.9 25.9",
              "fill": "none",
              "stroke": "currentColor",
              "strokeWidth": "5",
              "strokeLinecap": "round",
              "strokeLinejoin": "round"
            }
          },
          {
            "t": "path",
            "p": {
              "d": "M40 34 L25.2 30.5 L36.5 19.2 Z",
              "fill": "currentColor"
            }
          }
        ]
      }
    ]
  },
  "sharp-right": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M15 44 L15 14 Q15 9 18.5 12.5 L31.9 25.9",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M40 34 L25.2 30.5 L36.5 19.2 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "slight-left": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "g",
        "p": {
          "transform": "matrix(-1 0 0 1 48 0)"
        },
        "c": [
          {
            "t": "path",
            "p": {
              "d": "M19 44 L19 33 Q19 25 24.7 19.3 L29.9 14.1",
              "fill": "none",
              "stroke": "currentColor",
              "strokeWidth": "5",
              "strokeLinecap": "round",
              "strokeLinejoin": "round"
            }
          },
          {
            "t": "path",
            "p": {
              "d": "M38 6 L34.5 20.8 L23.2 9.5 Z",
              "fill": "currentColor"
            }
          }
        ]
      }
    ]
  },
  "slight-right": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M19 44 L19 33 Q19 25 24.7 19.3 L29.9 14.1",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M38 6 L34.5 20.8 L23.2 9.5 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "turn-left": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "g",
        "p": {
          "transform": "matrix(-1 0 0 1 48 0)"
        },
        "c": [
          {
            "t": "path",
            "p": {
              "d": "M17 44 L17 27 Q17 19 25 19 L31.5 19",
              "fill": "none",
              "stroke": "currentColor",
              "strokeWidth": "5",
              "strokeLinecap": "round",
              "strokeLinejoin": "round"
            }
          },
          {
            "t": "path",
            "p": {
              "d": "M43 19 L30 27 L30 11 Z",
              "fill": "currentColor"
            }
          }
        ]
      }
    ]
  },
  "turn-right": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M17 44 L17 27 Q17 19 25 19 L31.5 19",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M43 19 L30 27 L30 11 Z",
          "fill": "currentColor"
        }
      }
    ]
  },
  "uturn": {
    "viewBox": "0 0 48 48",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M14 44 V20 A10 10 0 0 1 34 20 V31.5",
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M34 44 L26 31 L42 31 Z",
          "fill": "currentColor"
        }
      }
    ]
  }
};

export const MAP_GLYPHS: Record<string, SvgGlyph> = {
  "destination-pin": {
    "viewBox": "0 0 48 64",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M24 62 L9.1 35.3 A17 17 0 1 1 38.9 35.3 Z",
          "fill": "#ffffff",
          "stroke": "#ffffff",
          "strokeWidth": "5",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24 62 L9.1 35.3 A17 17 0 1 1 38.9 35.3 Z",
          "fill": "#f5a623",
          "stroke": "#030712",
          "strokeWidth": "2",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "g",
        "p": {
          "transform": "translate(0 4)"
        },
        "c": [
          {
            "t": "rect",
            "p": {
              "x": "16",
              "y": "15",
              "width": "16",
              "height": "16",
              "rx": "2.5",
              "fill": "#ffffff"
            }
          },
          {
            "t": "path",
            "p": {
              "d": "M16 17.5 A2.5 2.5 0 0 1 18.5 15 H20 V19 H16 Z M24 15 H28 V19 H24 Z M20 19 H24 V23 H20 Z M28 19 H32 V23 H28 Z M16 23 H20 V27 H16 Z M24 23 H28 V27 H24 Z M20 27 H24 V31 H20 Z M28 27 H32 V28.5 A2.5 2.5 0 0 1 29.5 31 H28 Z",
              "fill": "#030712"
            }
          }
        ]
      }
    ]
  },
  "puck-heading": {
    "viewBox": "0 0 64 64",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "32",
          "cy": "32",
          "r": "30",
          "fill": "#f5a623",
          "fillOpacity": ".18"
        }
      },
      {
        "t": "circle",
        "p": {
          "cx": "32",
          "cy": "32",
          "r": "19",
          "fill": "#030712",
          "stroke": "#ffffff",
          "strokeWidth": "3"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M32 18 L42.5 43 L32 37 L21.5 43 Z",
          "fill": "#f5a623",
          "stroke": "#f5a623",
          "strokeWidth": "1.5",
          "strokeLinejoin": "round"
        }
      }
    ]
  },
  "puck-no-heading": {
    "viewBox": "0 0 64 64",
    "nodes": [
      {
        "t": "circle",
        "p": {
          "cx": "32",
          "cy": "32",
          "r": "30",
          "fill": "#f5a623",
          "fillOpacity": ".18"
        }
      },
      {
        "t": "circle",
        "p": {
          "cx": "32",
          "cy": "32",
          "r": "19",
          "fill": "#030712",
          "stroke": "#ffffff",
          "strokeWidth": "3"
        }
      },
      {
        "t": "circle",
        "p": {
          "cx": "32",
          "cy": "32",
          "r": "8.5",
          "fill": "#f5a623"
        }
      }
    ]
  },
  "roadworks-marker": {
    "viewBox": "-2 -1 60 54",
    "nodes": [
      {
        "t": "path",
        "p": {
          "d": "M28 5 L52 46 H4 Z",
          "fill": "#ffffff",
          "stroke": "#ffffff",
          "strokeWidth": "9",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M28 5 L52 46 H4 Z",
          "fill": "#ffffff",
          "stroke": "#d71f2b",
          "strokeWidth": "5.5",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M26.3 17 H29.7 L35.6 39 H20.4 Z",
          "fill": "#030712",
          "stroke": "#030712",
          "strokeWidth": "1",
          "strokeLinejoin": "round"
        }
      },
      {
        "t": "path",
        "p": {
          "d": "M24.9 23 H31.1 L32 26.5 H24 Z M23.2 29.5 H32.8 L33.7 33 H22.3 Z",
          "fill": "#ffffff"
        }
      },
      {
        "t": "rect",
        "p": {
          "x": "16.5",
          "y": "38.5",
          "width": "23",
          "height": "3.5",
          "rx": "1.2",
          "fill": "#030712"
        }
      }
    ]
  }
};

export const ENTRY_GLYPHS: Record<string, SvgGlyph> = {
  "navigate-outline": {
    "viewBox": "0 0 24 24",
    "nodes": [
      {
        "t": "g",
        "p": {
          "fill": "none",
          "stroke": "currentColor",
          "strokeWidth": "1.5",
          "strokeLinecap": "round",
          "strokeLinejoin": "round"
        },
        "c": [
          {
            "t": "rect",
            "p": {
              "x": "5.25",
              "y": "5.25",
              "width": "13.5",
              "height": "13.5",
              "rx": "2.75",
              "transform": "rotate(45 12 12)"
            }
          },
          {
            "t": "path",
            "p": {
              "d": "M9.75 15.25 V12.75 A1.75 1.75 0 0 1 11.5 11 H15"
            }
          },
          {
            "t": "path",
            "p": {
              "d": "M13 9 L15 11 L13 13"
            }
          }
        ]
      }
    ]
  },
  "navigate": {
    "viewBox": "0 0 24 24",
    "nodes": [
      {
        "t": "defs",
        "p": {},
        "c": [
          {
            "t": "mask",
            "p": {
              "id": "nav-cut"
            },
            "c": [
              {
                "t": "rect",
                "p": {
                  "width": "24",
                  "height": "24",
                  "fill": "#fff"
                }
              },
              {
                "t": "g",
                "p": {
                  "fill": "none",
                  "stroke": "#000",
                  "strokeWidth": "1.75",
                  "strokeLinecap": "round",
                  "strokeLinejoin": "round"
                },
                "c": [
                  {
                    "t": "path",
                    "p": {
                      "d": "M9.75 15.25 V12.75 A1.75 1.75 0 0 1 11.5 11 H15"
                    }
                  },
                  {
                    "t": "path",
                    "p": {
                      "d": "M13 9 L15 11 L13 13"
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "t": "g",
        "p": {
          "mask": "url(#nav-cut)"
        },
        "c": [
          {
            "t": "rect",
            "p": {
              "x": "4.5",
              "y": "4.5",
              "width": "15",
              "height": "15",
              "rx": "3",
              "transform": "rotate(45 12 12)",
              "fill": "currentColor"
            }
          }
        ]
      }
    ]
  }
};
