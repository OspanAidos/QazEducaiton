import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

/**
 * Вопросы и ответы. Открытая по умолчанию первая карточка, чтобы
 * страница не выглядела пустым списком заголовков.
 * Управление с клавиатуры работает штатно: это кнопки.
 */
export default function Accordion({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="border-t border-line">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q} className="border-b border-line">
            <h3>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-6 py-6 text-left"
                aria-expanded={open}
                aria-controls={`faq-panel-${i}`}
                id={`faq-button-${i}`}
                onClick={() => setOpenIndex(open ? -1 : i)}
              >
                <span className="max-w-[46ch] font-display text-lg font-bold leading-snug tracking-tight lg:text-2xl">
                  {item.q}
                </span>
                <Plus
                  size={22}
                  weight="bold"
                  aria-hidden="true"
                  className={`mt-1 shrink-0 text-accent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    open ? "rotate-45" : ""
                  }`}
                />
              </button>
            </h3>

            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-button-${i}`}
              hidden={!open}
            >
              <p className="max-w-[64ch] pb-7 text-base leading-relaxed text-ink-2 lg:text-lg">
                {item.a}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
