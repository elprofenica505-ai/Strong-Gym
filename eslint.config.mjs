import next from "eslint-config-next";

/**
 * ============================================================
 *  ESLint — configuración del proyecto
 * ============================================================
 *  Next 16 ya no trae el comando `next lint`, así que el script
 *  `npm run lint` llama a ESLint directamente con este archivo.
 *  La config de Next incluye las reglas de React, de los hooks
 *  y de accesibilidad, más las propias del framework.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts"],
  },

  ...next,

  {
    rules: {
      /**
       * Reglas del React Compiler.
       *
       *  · set-state-in-effect → queda como error: las diez pantallas que
       *    la incumplían se reescribieron (lectura del navegador con
       *    useSyncExternalStore, estado deducido y cargas que esperan la
       *    respuesta antes de tocar el estado). Si aparece de nuevo, es un
       *    render en cascada real y hay que corregirlo, no silenciarlo.
       *  · immutability → aviso: escribir `document.cookie` para recordar
       *    el idioma elegido es intencional.
       */
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/immutability": "warn",
    },
  },
];

export default config;
