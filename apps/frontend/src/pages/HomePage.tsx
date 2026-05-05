import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { QrCode, Smartphone, Layers, Star } from 'lucide-react';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      
      {/* Decorative Background Blur */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-10%] w-[30%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-semibold mb-8 border border-accent/20 backdrop-blur-md">
          <Star className="w-4 h-4 fill-accent text-accent" />
          <span>#1 Leading QR SaaS Platform</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-foreground max-w-4xl leading-tight">
          The Modern <span className="text-accent text-glow">QR Menu</span> Infrastructure
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl font-medium">
          Empower your restaurant with seamless digital ordering, real-time table management, and completely custom brand designs in under 3 minutes.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <Link to="/register">
              <Button size="lg" className="w-full sm:w-auto text-lg px-10 py-6 font-bold bg-foreground text-background hover:bg-black hover:-translate-y-1 transition-all duration-300 shadow-xl cursor-pointer rounded-2xl">
                Get Started Free
              </Button>
          </Link>
          <Link to="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg px-8 py-6 font-bold border-2 border-border text-foreground hover:bg-muted transition-all duration-300 rounded-2xl cursor-pointer">
                View Live Demo
              </Button>
          </Link>
        </div>

        {/* Mock Screen / Dashboard Preview (Glassmorphism layout) */}
        <div className="relative w-full max-w-5xl mx-auto">
           <div className="glass-panel w-full rounded-2xl p-4 sm:p-8 aspect-[16/9] sm:aspect-[21/9] flex items-center justify-center relative overflow-hidden backdrop-blur-xl">
             {/* Fake App UI lines */}
             <div className="absolute top-0 left-0 w-full h-12 border-b border-white/20 flex items-center px-4 gap-2 bg-white/10">
               <div className="w-3 h-3 rounded-full bg-red-400"></div>
               <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
               <div className="w-3 h-3 rounded-full bg-green-400"></div>
             </div>
             
             <div className="flex flex-col items-center opacity-40">
                <QrCode className="w-24 h-24 mb-4" />
                <span className="font-bold text-xl tracking-widest text-foreground">DASHBOARD PREVIEW</span>
             </div>
           </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative py-24 bg-secondary/50 border-t border-border backdrop-blur-3xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4">Built for scale. Designed for speed.</h2>
            <p className="text-muted-foreground text-lg">Everything you need to modernize your dining experience.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 text-left">
            <div className="glass-panel bg-card p-8 rounded-3xl hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] hover:-translate-y-2 transition-all duration-300">
              <div className="w-14 h-14 bg-accent/20 text-accent flex items-center justify-center rounded-2xl mb-6 shadow-inner">
                <Smartphone className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-foreground">App-less Experience</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">Give your customers a premium browsing experience instantly tailored to their devices without forcing a download.</p>
            </div>
            
            <div className="glass-panel bg-white/80 p-8 rounded-3xl hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] hover:-translate-y-2 transition-all duration-300">
              <div className="w-14 h-14 bg-blue-100/50 text-blue-600 flex items-center justify-center rounded-2xl mb-6 shadow-inner">
                <QrCode className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-foreground">Instant Ordering</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">Skip the line. Real-time cart checkouts synchronize directly from the table to the back-of-house screens instantly.</p>
            </div>
            
            <div className="glass-panel bg-white/80 p-8 rounded-3xl hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] hover:-translate-y-2 transition-all duration-300">
              <div className="w-14 h-14 bg-purple-100/50 text-purple-600 flex items-center justify-center rounded-2xl mb-6 shadow-inner">
                <Layers className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-foreground">High-End Branding</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">Custom tailored accent colors, logos, and typography that elevate your digital storefront above the competition.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};

export default HomePage;
