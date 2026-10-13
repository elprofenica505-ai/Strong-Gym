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
       * Estas dos reglas vienen del React Compiler y marcan como error
       * patrones que acá son correctos y necesarios:
       *
       *  · set-state-in-effect → sincronizar el estado con APIs del
       *    navegador que sólo existen en el cliente (IntersectionObserver
       *    en Reveal, localStorage en el aviso de modo demo, la carga
       *    inicial de reservas). Son efectos de sincronización reales,
       *    no renders en cascada evitables.
       *  · immutability → escribir `document.cookie` para recordar el
       *    idioma elegido.
       *
       * Las dejamos como aviso para seguir viéndolas sin frenar el CI.
       */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default config;
