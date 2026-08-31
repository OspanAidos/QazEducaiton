import { motion, useReducedMotion } from "motion/react";

/**
 * Появление блока при входе в экран. Одно движение, одна причина:
 * задать порядок чтения крупных утверждений сверху вниз.
 * При prefers-reduced-motion анимация не запускается вовсе.
 */
export default function Reveal({ children, delay = 0, className = "" }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
