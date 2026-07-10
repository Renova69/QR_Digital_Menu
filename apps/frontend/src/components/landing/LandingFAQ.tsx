import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, ChevronDown } from "lucide-react";
import { getHelpContent, type HelpContentItem } from "../../lib/api";

function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = String(item[key]);
    const group = map.get(k) || [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}

const LandingFAQ = () => {
  const { t, i18n } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const answerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { data: items = [] } = useQuery({
    queryKey: ["help-content", "landing", i18n.language],
    queryFn: () => getHelpContent("landing", i18n.language),
  });

  const faqGroups = groupBy(
    items.filter((i) => i.active),
    "itemKey",
  );

  useEffect(() => {
    answerRefs.current.forEach((el, id) => {
      if (id === expandedId) {
        el.style.maxHeight = el.scrollHeight + "px";
        el.style.opacity = "1";
      } else {
        el.style.maxHeight = "0px";
        el.style.opacity = "0";
      }
    });
  }, [expandedId]);

  const toggleFaq = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <section className="relative py-24 md:py-32 border-t border-border bg-secondary/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.15em] mb-4 border border-primary/20">
            <HelpCircle className="w-3.5 h-3.5" />
            {t("landing.faq.badge", "Got Questions?")}
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-display font-black text-foreground tracking-tight mb-4">
            {t("landing.faq.title", "Frequently Asked Questions")}
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
            {t(
              "landing.faq.subtitle",
              "Everything you need to know before getting started.",
            )}
          </p>
        </div>

        {/* FAQ accordion */}
        <div className="space-y-3">
          {Array.from(faqGroups.entries())
            .sort(
              ([, a], [, b]) => (a[0]?.sortOrder ?? 0) - (b[0]?.sortOrder ?? 0),
            )
            .map(([itemKey, localeItems]) => {
              const item = localeItems[0];
              if (!item) return null;
              const isExpanded = expandedId === itemKey;
              return (
                <div
                  key={itemKey}
                  className="group glass-panel rounded-2xl border border-border/50 hover:border-primary/20 overflow-hidden transition-all duration-300 ease-out motion-safe:hover:shadow-[0_10px_30px_-10px_var(--color-accent)/0.1]"
                >
                  <button
                    onClick={() => toggleFaq(itemKey)}
                    className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left font-semibold text-sm md:text-base text-foreground cursor-pointer"
                    aria-expanded={isExpanded}
                  >
                    <span className="leading-snug pr-4">{item.title}</span>
                    <ChevronDown
                      className={`w-5 h-5 shrink-0 transition-all duration-300 ease-out ${
                        isExpanded
                          ? "rotate-180 text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>

                  <div
                    ref={(el) => {
                      if (el) answerRefs.current.set(itemKey, el);
                    }}
                    className="overflow-hidden transition-all duration-300 ease-out"
                    style={{ maxHeight: "0px", opacity: "0" }}
                  >
                    <div className="px-5 md:px-6 pb-5 md:pb-6">
                      <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                        {item.body}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
};

export default LandingFAQ;
