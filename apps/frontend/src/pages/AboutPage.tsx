import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  ShieldCheck, 
  CreditCard, 
  FileCheck, 
  Zap, 
  TrendingUp, 
  Smile, 
  ArrowRight,
  Clock
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { RenovaBrand } from "../components/brand/RenovaBrand";

const AboutPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t("about.pageTitle", "About Us")} — Renova`;
  }, [t]);

  return (
    <div className="min-h-screen bg-background flex flex-col pt-24 pb-12 overflow-x-hidden">
      
      {/* 1. Trust Policy Bar */}
      <div className="w-full bg-secondary/30 border-y border-border/50 py-3 backdrop-blur-sm relative z-10 mb-8 sm:mb-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 text-xs sm:text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{t("about.policy.guarantee", "30-Day Money-Back Guarantee")}</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-500" />
              <span>{t("about.policy.noCard", "No Credit Card Required to Setup")}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-500" />
              <span>{t("about.policy.compliant", "NRA & ANAF Compliant Digital Menus")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-7xl flex-1 flex flex-col gap-24 sm:gap-32">
        
        {/* 2. Hero Section (The Shared Mission) */}
        <section className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center relative">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="flex flex-col gap-6 relative z-10 w-full lg:pr-8">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground leading-[1.1]">
              {t("about.hero.title", "\"We believe restaurant owners shouldn't have to choose between running a busy kitchen and enjoying their lives.\"")}
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl">
              {t("about.hero.subtitle", "We built Renova because we saw hard-working owners struggling with endless staff shortages, rising paper printing costs, and slow service. Our mission is to put control back in your hands.")}
            </p>
            <div className="pt-4">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 bg-[#FF9900] hover:bg-[#E68A00] text-white font-bold text-lg px-8 py-4 rounded-2xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 group"
              >
                {t("about.hero.cta", "Join Our Mission – Start Free")}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
          
          <div className="relative w-full aspect-square mx-auto lg:w-full lg:max-w-none">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent rounded-[3rem] rotate-3 scale-105" />
            <img 
              src="/about-hero.jpg" 
              alt={t("about.hero.imageAlt", "Happy restaurant owner")} 
              className="w-full h-full object-cover rounded-[3rem] shadow-2xl relative z-10 border border-border/10"
            />
            {/* Floating indicator */}
            <div className="absolute -bottom-6 -left-6 bg-background/80 backdrop-blur-md border border-border p-4 rounded-2xl shadow-xl z-20 flex items-center gap-4 animate-bounce-slow">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{t("about.hero.statTitle", "Time Saved")}</p>
                <p className="text-xs text-muted-foreground">{t("about.hero.statValue", "15+ mins / table")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. The Origin Story */}
        <section className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl font-black mb-8 text-foreground tracking-tight">
            {t("about.origin.title", "Born in the Heat of the Friday Night Rush")}
          </h2>
          <div className="prose prose-lg dark:prose-invert mx-auto text-muted-foreground leading-relaxed">
            <p>
              {t("about.origin.p1", "If you've ever run a restaurant, you know the absolute chaos of a Friday night: three waiters called in sick, customers waiting twenty minutes just to catch someone's eye to order a drink, and tables left unserved. we've been there. we've felt that exact stress.")}
            </p>
            <p>
              {t("about.origin.p2", "We realized that paper menus were holding restaurants back. They are slow to update, expensive to print, and create a bottleneck. We knew there had to be a better, simpler way to help local diners order and pay instantly, directly from their tables. That's why we engineered Renova.")}
            </p>
          </div>
        </section>

        {/* 4. Our Philosophy: 3 Core Pillars */}
        <section className="relative z-10">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass-panel p-8 rounded-[2rem] flex flex-col gap-4 border border-border/50 hover:border-primary/50 transition-colors group">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Zap className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mt-2">{t("about.pillars.p1.title", "0% Learning Curve")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("about.pillars.p1.desc", "We design for busy owners and older staff. No complicated installations, no tech-headaches, and no customer app downloads required.")}
              </p>
            </div>
            
            <div className="glass-panel p-8 rounded-[2rem] flex flex-col gap-4 border border-border/50 hover:border-[#FF9900]/50 transition-colors group">
              <div className="w-16 h-16 rounded-2xl bg-[#FF9900]/10 flex items-center justify-center text-[#FF9900] group-hover:scale-110 transition-transform">
                <TrendingUp className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mt-2">{t("about.pillars.p2.title", "Putting Profit Back in Your Pocket")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("about.pillars.p2.desc", "We don't believe in taking huge percentage cuts of your hard-earned orders. You pay a flat, transparent monthly subscription. Period.")}
              </p>
            </div>
            
            <div className="glass-panel p-8 rounded-[2rem] flex flex-col gap-4 border border-border/50 hover:border-emerald-500/50 transition-colors group">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                <Smile className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mt-2">{t("about.pillars.p3.title", "Flawless Guest Experiences")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("about.pillars.p3.desc", "We build tools that make ordering fun, fast, and completely effortless for your guests, naturally driving up average order values.")}
              </p>
            </div>
          </div>
        </section>

        {/* 5. Start-Up Trust Builders */}
        <section className="w-full bg-secondary/50 rounded-[3rem] p-8 sm:p-12 border border-border/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="grid md:grid-cols-3 gap-8 relative z-10 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="flex flex-col items-center justify-center text-center pb-8 md:pb-0 md:px-8">
              <div className="text-5xl font-black text-foreground mb-2 flex items-center justify-center">
                15-20<span className="text-3xl ml-1 text-muted-foreground font-bold">{t("about.stats.s1.unit", "m")}</span>
              </div>
              <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">{t("about.stats.s1.title", "Saved per table turn")}</p>
              <p className="text-xs text-muted-foreground mt-2">{t("about.stats.s1.desc", "by automating orders")}</p>
            </div>
            
            <div className="flex flex-col items-center justify-center text-center py-8 md:py-0 md:px-8">
              <div className="text-5xl font-black text-foreground mb-2 flex items-center justify-center">
                {t("about.stats.s2.value", "€0.00")}
              </div>
              <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">{t("about.stats.s2.title", "Ever wasted again")}</p>
              <p className="text-xs text-muted-foreground mt-2">{t("about.stats.s2.desc", "on printing updated paper menus")}</p>
            </div>
            
            <div className="flex flex-col items-center justify-center text-center pt-8 md:pt-0 md:px-8">
              <div className="text-5xl font-black text-[#FF9900] mb-2 flex items-center justify-center">
                {t("about.stats.s3.value", "22%")}
              </div>
              <p className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">{t("about.stats.s3.title", "Avg. Increase")}</p>
              <p className="text-xs text-muted-foreground mt-2">{t("about.stats.s3.desc", "in order value via automatic upsell")}</p>
            </div>
          </div>
        </section>

        {/* 6. The Founders' Guarantee */}
        <section className="max-w-3xl mx-auto relative z-10 w-full">
          <div className="bg-background border-2 border-border/80 rounded-[2rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 blur-[40px] rounded-full" />
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-foreground">
                {t("about.guarantee.title", "Our Personal Promise: Try Us Completely Risk-Free for 30 Days")}
              </h3>
            </div>
            <p className="text-lg text-muted-foreground leading-relaxed italic mb-8 relative">
              <span className="text-4xl text-border absolute -top-4 -left-4">"</span>
              {t("about.guarantee.desc", "We know trying new software feels like a gamble when you have a restaurant to run. That's why we remove all the risk. If Renova doesn't save your staff hours of work and make your ordering smoother within your first 30 days, we will refund every single cent of your subscription. No questions asked, no hard feelings.")}
            </p>
            <div className="flex items-center justify-end gap-4 border-t border-border/50 pt-6">
              <div className="text-right">
                <p className="font-bold text-foreground">{t("about.guarantee.signName", "The Founders")}</p>
                <p className="text-sm text-muted-foreground">{t("about.guarantee.signRole", "Founders of Renova")}</p>
              </div>
              <RenovaBrand size="sm" />
            </div>
          </div>
        </section>

        {/* 7. Final Action CTA Block */}
        <section className="w-full bg-foreground text-background rounded-[3rem] p-12 sm:p-20 text-center relative overflow-hidden mb-12">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/30 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#FF9900]/20 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center gap-6">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]">
              {t("about.cta.title", "Ready to give your restaurant a digital advantage?")}
            </h2>
            <p className="text-xl sm:text-2xl text-background/80 max-w-2xl">
              {t("about.cta.subtitle", "Let’s get your digital menu live today. Set up in under 10 minutes.")}
            </p>
            <Link
              to="/register"
              className="mt-6 inline-flex items-center justify-center gap-2 bg-[#FF9900] hover:bg-[#E68A00] text-white font-bold text-xl px-12 py-5 rounded-full transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 w-full sm:w-auto"
            >
              {t("about.cta.button", "Create Your Free Account Now")}
              <ArrowRight className="w-6 h-6" />
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
};

export default AboutPage;
