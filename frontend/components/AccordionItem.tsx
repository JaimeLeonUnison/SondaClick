import React, { useState, useRef, useEffect } from "react";

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onClick: () => void;
}

const AccordionItem: React.FC<AccordionItemProps> = ({
  title,
  children,
  isOpen,
  onClick,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<string>("0px");

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(isOpen ? `${contentRef.current.scrollHeight}px` : "0px");
    }
  }, [isOpen, children]);

  return (
    <div className="border-b border-slate-200 dark:border-gray-300 last:border-b-0"> {/* CAMBIO: dark:border-gray-300 */}
      <button
        onClick={onClick}
        className="w-full flex justify-between items-center py-4 px-4 text-slate-800 dark:text-slate-800 focus:outline-none group" // CAMBIO: dark:text-slate-800
        aria-expanded={isOpen}
      >
        <span
          className={`font-semibold text-left transition-colors duration-200 ${
            isOpen
              ? "text-blue-600 dark:text-blue-400" 
              : "group-hover:text-blue-600 dark:group-hover:text-blue-400" 
          }`} // El color base oscuro lo toma del botón padre
        >
          {title}
        </span>
        <span
          className={`transition-transform duration-300 ${ // Color base del icono y color activo/hover
            isOpen 
              ? "rotate-0 text-blue-600 dark:text-blue-400" 
              : "rotate-180 text-slate-500 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400"
          }`} // CAMBIO: dark:text-slate-500 para el icono cerrado
        >
          {isOpen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path
                fillRule="evenodd"
                d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path
                fillRule="evenodd"
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </span>
      </button>
      <div
        ref={contentRef}
        style={{ maxHeight: contentHeight }}
        className="overflow-hidden transition-all duration-300 ease-in-out"
      >
        <div className="pb-5 pt-1 px-4 text-sm text-slate-600 dark:text-slate-700"> {/* CAMBIO: dark:text-slate-700 */}
          {children}
        </div>
      </div>
    </div>
  );
};

interface AccordionGroupProps {
  items: Array<{
    id: string | number;
    title: string;
    content: React.ReactNode;
  }>;
  allowMultipleOpen?: boolean;
  defaultOpenId?: string | number | (string | number)[];
}

export const TailwindAccordion: React.FC<AccordionGroupProps> = ({
  items,
  allowMultipleOpen = false,
  defaultOpenId,
}) => {
  const [openItems, setOpenItems] = useState<Array<string | number>>(() => {
    if (defaultOpenId) {
      return Array.isArray(defaultOpenId) ? defaultOpenId : [defaultOpenId];
    }
    return [];
  });

  const handleToggle = (id: string | number) => {
    setOpenItems((prevOpenItems) => {
      const isOpen = prevOpenItems.includes(id);
      if (allowMultipleOpen) {
        return isOpen
          ? prevOpenItems.filter((item) => item !== id)
          : [...prevOpenItems, id];
      } else {
        return isOpen ? [] : [id];
      }
    });
  };

  return (
    <div className="w-full rounded-lg border border-slate-200 dark:border-gray-300 bg-white dark:bg-white shadow-md"> {/* CAMBIOS: dark:border-gray-300 y dark:bg-white */}
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          title={item.title}
          isOpen={openItems.includes(item.id)}
          onClick={() => handleToggle(item.id)}
        >
          {item.content}
        </AccordionItem>
      ))}
    </div>
  );
};

export default AccordionItem;